using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.Timeseries.Common.Daos;
using Pleiades.Playground.Timeseries.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Timeseries.Persistence;

/// <summary>
/// Implements main background worker service for persistence
/// </summary>
internal class Worker : BackgroundService
{
    /// <summary>
    /// Upper bound of buffered items per value type. Bounds memory growth while the
    /// downstream API is unavailable; values that would exceed the cap are dropped.
    /// </summary>
    private const int MaxBufferedItems = 500_000;

    private readonly IBaseUnitValueService _baseUnitValueService;
    private readonly IStringValueService _stringValueService;
    private readonly IBooleanValueService _booleanValueService;
    private readonly IManagedMqttClient _mqttClient;
    private readonly Config _config;
    private readonly ILogger<Worker> _logger;
    private readonly MqttSubscriptionReadiness _readiness;

    private readonly JsonSerializerOptions? _jsonSerializerOptions;

    private readonly Lock _bufferLock = new();

    private List<BaseUnitValueDao> _baseUnitValueDaoBuffer;
    private List<StringValueDao> _stringValueDaoBuffer;
    private List<BooleanValueDao> _booleanValueDaoBuffer;

    private static readonly Action<ILogger, Exception?> LogStarting = LoggerMessage.Define(LogLevel.Information, 0, "Worker is starting.");
    private static readonly Action<ILogger, Exception?> LogStopping = LoggerMessage.Define(LogLevel.Information, 1, "Worker is stopping.");
    private static readonly Action<ILogger, int?, string, long, Exception?> LogPost = LoggerMessage.Define<int?, string, long>(LogLevel.Debug, 3, "Posted {Values} {Type} values in {ElapsedMilliseconds} ms.");
    private static readonly Action<ILogger, int?, Exception?> LogErrorOnPostValues = LoggerMessage.Define<int?>(LogLevel.Error, 4, "Error on post values: http response code: {StatusCode}");
    private static readonly Action<ILogger, string, string, Exception?> LogPayloadMissmatch = LoggerMessage.Define<string, string>(LogLevel.Warning, 5, "Message payload missmatch on topic `{Topic}`. With payload:\n{Payload}");
    private static readonly Action<ILogger, string, string, Exception?> LogPayloadError = LoggerMessage.Define<string, string>(LogLevel.Warning, 6, "Message payload unproccessable on topic `{Topic}`. With payload:\n{Payload}");
    private static readonly Action<ILogger, string, int, Exception?> LogBufferFull = LoggerMessage.Define<string, int>(LogLevel.Warning, 8, "Buffer for {Type} values is full at {MaxBufferedItems} items. Dropping incoming value.");

    /// <summary>
    /// Default constructor
    /// </summary>
    public Worker(IOptions<Config> config,
                  ILogger<Worker> logger,
                  IOptions<JsonSerializerOptions> jsonSerializerOptions,
                  IBaseUnitValueService baseUnitValueService,
                  IStringValueService stringValueService,
                  IBooleanValueService booleanValueService,
                  IManagedMqttClient mqttClient,
                  MqttSubscriptionReadiness readiness)
    {
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(logger);
        ArgumentNullException.ThrowIfNull(baseUnitValueService);
        ArgumentNullException.ThrowIfNull(stringValueService);
        ArgumentNullException.ThrowIfNull(booleanValueService);
        ArgumentNullException.ThrowIfNull(readiness);

        _logger = logger;
        _jsonSerializerOptions = jsonSerializerOptions?.Value;
        _config = config.Value;
        _baseUnitValueService = baseUnitValueService;
        _stringValueService = stringValueService;
        _booleanValueService = booleanValueService;
        _mqttClient = mqttClient;
        _readiness = readiness;

        _baseUnitValueDaoBuffer = [];
        _stringValueDaoBuffer = [];
        _booleanValueDaoBuffer = [];
    }

    /// <see cref="BackgroundService"/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        LogStarting(_logger, null);

        // Handler FIRST, then subscribe: the other order drops whatever arrives in between.
        _mqttClient.ApplicationMessageReceivedAsync += HandleMqttData;

        // SubscribeAsync only queues the subscription and returns, with no broker as well. The broker's
        // answer is the SUBACK on SubscriptionsChangedAsync, so mqtt-subscription stays Unhealthy until
        // every filter named here is granted.
        _mqttClient.SubscriptionsChangedAsync += _readiness.HandleSubscriptionsChangedAsync;

        try
        {
            _readiness.MarkRequested(_config.Topics);

            foreach (var topic in _config.Topics)
            {
                await _mqttClient.SubscribeAsync(topic).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            // A subscribe that never succeeded leaves this service connected and consuming nothing.
            // Said out loud on /healthcheck, then rethrown so the host stops rather than idling.
            _readiness.MarkFaulted($"subscribe failed: {ex.Message}");
            throw;
        }

        // run process loop
        using PeriodicTimer timer = new(_config.CachingTime);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                await PostAndClearBuffers().ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            LogStopping(_logger, null);
        }
        finally
        {
            await _mqttClient.StopAsync().ConfigureAwait(false);
        }
    }

    private Task HandleMqttData(MqttApplicationMessageReceivedEventArgs args)
    {
        try
        {
            var message = args.ApplicationMessage.Parse<string>();
            var topic = message.Topic;
            var payload = message.Payload;
            var contentType = message.ContentType;

            if (payload == null)
            {
                return Task.CompletedTask;
            }

            switch (contentType)
            {
                case "baseunitvaluedto":
                    ProcessBaseUnitValue(payload, topic);
                    return Task.CompletedTask;

                case "stringvaluedto":
                case "stringvalue":
                    ProcessStringValue(payload, topic);
                    return Task.CompletedTask;

                case "booleanvaluedto":
                    ProcessBooleanValue(payload, topic);
                    return Task.CompletedTask;

                default:
                    HandleDefaultPayload(payload, topic);
                    return Task.CompletedTask;
            }
        }
        catch
        {
            LogPayloadError(_logger, args.ApplicationMessage.Topic, args.ApplicationMessage.ConvertPayloadToString(), null);
            return Task.CompletedTask;
        }
    }

    private void HandleDefaultPayload(string payload, string topic)
    {
        var json = JsonNode.Parse(payload);

        switch (json?["value"]?.GetValueKind())
        {
            case JsonValueKind.Number:
                ProcessBaseUnitValue(payload, topic);
                break;

            case JsonValueKind.String:
                ProcessStringValue(payload, topic);
                break;

            case JsonValueKind.True:
            case JsonValueKind.False:
                ProcessBooleanValue(payload, topic);
                break;

            default:
                LogPayloadMissmatch(_logger, topic, payload, null);
                break;
        }
    }

    private void ProcessBaseUnitValue(string payload, string topic)
    {
        var baseUnitValue = JsonSerializer.Deserialize<BaseUnitValueDto>(payload, _jsonSerializerOptions) ?? throw new InvalidOperationException("Deserialization of BaseUnitValueDto returned null.");
        var baseUnitValueDao = new BaseUnitValueDao
        {
            Timestamp = baseUnitValue.Timestamp,
            Topic = topic,
            Unit = baseUnitValue.Unit,
            Value = baseUnitValue.Value
        };
        AddBaseUnitValue(baseUnitValueDao);
    }

    private void ProcessStringValue(string payload, string topic)
    {
        var stringValue = JsonSerializer.Deserialize<StringValueDto>(payload, _jsonSerializerOptions) ?? throw new InvalidOperationException("Deserialization of StringValueDto returned null.");
        var stringValueDao = new StringValueDao
        {
            Timestamp = stringValue.Timestamp,
            Topic = topic,
            Value = stringValue.Value
        };
        AddStringValue(stringValueDao);
    }

    private void ProcessBooleanValue(string payload, string topic)
    {
        var booleanValue = JsonSerializer.Deserialize<BooleanValueDto>(payload, _jsonSerializerOptions) ?? throw new InvalidOperationException("Deserialization of BooleanValueDto returned null.");
        var booleanValueDao = new BooleanValueDao
        {
            Timestamp = booleanValue.Timestamp,
            Topic = topic,
            Value = booleanValue.Value
        };
        AddBooleanValue(booleanValueDao);
    }

    /// <summary>
    /// Appends a base unit value to the buffer under lock, dropping (with a counted warning)
    /// once the buffer reaches <see cref="MaxBufferedItems"/> to avoid unbounded growth.
    /// </summary>
    internal void AddBaseUnitValue(BaseUnitValueDao dao)
    {
        lock (_bufferLock)
        {
            if (_baseUnitValueDaoBuffer.Count < MaxBufferedItems)
            {
                _baseUnitValueDaoBuffer.Add(dao);
            }
            else
            {
                LogBufferFull(_logger, "baseunit", MaxBufferedItems, null);
            }
        }
    }

    /// <summary>
    /// Appends a string value to the buffer under lock, dropping (with a counted warning)
    /// once the buffer reaches <see cref="MaxBufferedItems"/> to avoid unbounded growth.
    /// </summary>
    internal void AddStringValue(StringValueDao dao)
    {
        lock (_bufferLock)
        {
            if (_stringValueDaoBuffer.Count < MaxBufferedItems)
            {
                _stringValueDaoBuffer.Add(dao);
            }
            else
            {
                LogBufferFull(_logger, "string", MaxBufferedItems, null);
            }
        }
    }

    /// <summary>
    /// Appends a boolean value to the buffer under lock, dropping (with a counted warning)
    /// once the buffer reaches <see cref="MaxBufferedItems"/> to avoid unbounded growth.
    /// </summary>
    internal void AddBooleanValue(BooleanValueDao dao)
    {
        lock (_bufferLock)
        {
            if (_booleanValueDaoBuffer.Count < MaxBufferedItems)
            {
                _booleanValueDaoBuffer.Add(dao);
            }
            else
            {
                LogBufferFull(_logger, "boolean", MaxBufferedItems, null);
            }
        }
    }

    /// <summary>
    /// Atomically snapshots and clears the base unit buffer under lock, so no value added
    /// during the swap can be lost. Returns an empty array when the buffer is empty.
    /// </summary>
    internal BaseUnitValueDao[] DetachBaseUnitValues()
    {
        lock (_bufferLock)
        {
            if (_baseUnitValueDaoBuffer.Count == 0)
            {
                return [];
            }

            var snapshot = _baseUnitValueDaoBuffer.ToArray();
            _baseUnitValueDaoBuffer = [];
            return snapshot;
        }
    }

    /// <summary>
    /// Atomically snapshots and clears the string buffer under lock, so no value added
    /// during the swap can be lost. Returns an empty array when the buffer is empty.
    /// </summary>
    internal StringValueDao[] DetachStringValues()
    {
        lock (_bufferLock)
        {
            if (_stringValueDaoBuffer.Count == 0)
            {
                return [];
            }

            var snapshot = _stringValueDaoBuffer.ToArray();
            _stringValueDaoBuffer = [];
            return snapshot;
        }
    }

    /// <summary>
    /// Atomically snapshots and clears the boolean buffer under lock, so no value added
    /// during the swap can be lost. Returns an empty array when the buffer is empty.
    /// </summary>
    internal BooleanValueDao[] DetachBooleanValues()
    {
        lock (_bufferLock)
        {
            if (_booleanValueDaoBuffer.Count == 0)
            {
                return [];
            }

            var snapshot = _booleanValueDaoBuffer.ToArray();
            _booleanValueDaoBuffer = [];
            return snapshot;
        }
    }

    private async Task PostAndClearBuffers()
    {
        var baseUnitBufferCopy = DetachBaseUnitValues();
        var stringValueBufferCopy = DetachStringValues();
        var booleanValueBufferCopy = DetachBooleanValues();

        await Task.WhenAll(
            PostBaseUnitValuesIfNotEmpty(baseUnitBufferCopy),
            PostStringValuesIfNotEmpty(stringValueBufferCopy),
            PostBooleanValuesIfNotEmpty(booleanValueBufferCopy)
        ).ConfigureAwait(false);
    }

    internal async Task PostBaseUnitValuesIfNotEmpty(BaseUnitValueDao[] buffer)
    {
        if (buffer.Length > 0)
        {
            try
            {
                var baseUnitValues = buffer
                    .GroupBy(v => v.Topic)
                    .ToDictionary(
                        group => group.Key,
                        group => new BaseUnitSeriesRequestDto
                        {
                            Unit = group.First().Unit,
                            DataPoints = group.Select(v => new DataPointDto<double> { Timestamp = v.Timestamp, Value = v.Value }).ToList()
                        }
                    );
                var stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var dto = await _baseUnitValueService.PostBaseUnitValues(baseUnitValues).ConfigureAwait(false);
                stopwatch.Stop();
                LogPost(_logger, dto.ValuesCount, "baseunit", stopwatch.ElapsedMilliseconds, null);
            }
            catch (Exception ex)
            {
                LogErrorOnPostValues(_logger, null, ex);
                // Requeue the batch (bounded) so a transient outage does not drop the interval's data.
                lock (_bufferLock)
                {
                    _baseUnitValueDaoBuffer.InsertRange(0, buffer.Take(MaxBufferedItems - _baseUnitValueDaoBuffer.Count));
                }
            }
        }
    }

    internal async Task PostStringValuesIfNotEmpty(StringValueDao[] buffer)
    {
        if (buffer.Length > 0)
        {
            try
            {
                var stringValues = buffer
                    .GroupBy(v => v.Topic)
                    .ToDictionary(
                        group => group.Key,
                        group => new StringSeriesRequestDto
                        {
                            DataPoints = group.Select(v => new DataPointDto<string> { Timestamp = v.Timestamp, Value = v.Value }).ToList()
                        }
                    );
                var stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var dto = await _stringValueService.PostStringValues(stringValues).ConfigureAwait(false);
                stopwatch.Stop();
                LogPost(_logger, dto.ValuesCount, "string", stopwatch.ElapsedMilliseconds, null);
            }
            catch (Exception ex)
            {
                LogErrorOnPostValues(_logger, null, ex);
                // Requeue the batch (bounded) so a transient outage does not drop the interval's data.
                lock (_bufferLock)
                {
                    _stringValueDaoBuffer.InsertRange(0, buffer.Take(MaxBufferedItems - _stringValueDaoBuffer.Count));
                }
            }
        }
    }

    internal async Task PostBooleanValuesIfNotEmpty(BooleanValueDao[] buffer)
    {
        if (buffer.Length > 0)
        {
            try
            {
                var booleanValues = buffer
                    .GroupBy(v => v.Topic)
                    .ToDictionary(
                        group => group.Key,
                        group => new BooleanSeriesRequestDto
                        {
                            DataPoints = group.Select(v => new DataPointDto<bool> { Timestamp = v.Timestamp, Value = v.Value }).ToList()
                        }
                    );
                var stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var dto = await _booleanValueService.PostBooleanValues(booleanValues).ConfigureAwait(false);
                stopwatch.Stop();
                LogPost(_logger, dto.ValuesCount, "boolean", stopwatch.ElapsedMilliseconds, null);
            }
            catch (Exception ex)
            {
                LogErrorOnPostValues(_logger, null, ex);
                // Requeue the batch (bounded) so a transient outage does not drop the interval's data.
                lock (_bufferLock)
                {
                    _booleanValueDaoBuffer.InsertRange(0, buffer.Take(MaxBufferedItems - _booleanValueDaoBuffer.Count));
                }
            }
        }
    }

    ///<see cref="IDisposable" />
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "S3971:\"GC.SuppressFinalize\" should not be called", Justification = "BackgroundService has no Dispose pattern implementation")]
    public override void Dispose()
    {
        base.Dispose();
        _mqttClient.Dispose();
        GC.SuppressFinalize(this);
    }
}
