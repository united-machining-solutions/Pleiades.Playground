using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.Api.Client.Exceptions;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Persistence;

public class Worker : BackgroundService
{
    private readonly INotificationEventService _notificationEventService;
    private readonly IManagedMqttClient _mqttClient;
    private readonly Config _config;
    private readonly ILogger<Worker> _logger;
    private readonly MqttSubscriptionReadiness _readiness;

    private readonly JsonSerializerOptions _jsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    private static readonly Action<ILogger, Exception?> LogStarting = LoggerMessage.Define(LogLevel.Information, 0, "Worker is starting.");
    private static readonly Action<ILogger, Exception?> LogStopping = LoggerMessage.Define(LogLevel.Information, 1, "Worker is stopping.");
    private static readonly Action<ILogger, string, string, Exception?> LogPostSuccessful = LoggerMessage.Define<string, string>(LogLevel.Information, 3, "Event sucessfully posted with id {ID} of type {ContentType}");
    private static readonly Action<ILogger, string, Exception?> LogPostFailed = LoggerMessage.Define<string>(LogLevel.Warning, 4, "Event not posted {ContentType}");
    /// <summary>What the log names as the content type of a message that carries none.</summary>
    private const string NoContentType = "(none)";

    private static readonly Action<ILogger, string, Exception?> LogErrorByHandlingMessage = LoggerMessage.Define<string>(LogLevel.Error, 6, "Error by handling mqtt message with content type {ContenType}.");

    public Worker(
        IOptions<Config> config,
        ILogger<Worker> logger,
        IManagedMqttClient mqttClient,
        INotificationEventService notificationEventService,
        MqttSubscriptionReadiness readiness)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _readiness = readiness ?? throw new ArgumentNullException(nameof(readiness));

        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
        _notificationEventService = notificationEventService ?? throw new ArgumentNullException(nameof(notificationEventService));
    }

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

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
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

    private async Task HandleMqttData(MqttApplicationMessageReceivedEventArgs args)
    {
        var message = args.ApplicationMessage.Parse<string>();
        var payload = message.Payload;
        var contentType = message.ContentType;

        ArgumentNullException.ThrowIfNull(payload);

        // ContentType is an MQTT 5 property, so every 3.1.1 publisher sends a message without one. That is
        // the same case as an unknown type: logged on the default branch's path and dropped, decided here
        // rather than left to MQTTnet catching an exception that leaves this handler.
        if (contentType is null)
        {
            LogErrorByHandlingMessage(_logger, NoContentType, null);
            return;
        }

        switch (contentType)
        {
            case var s when s.Equals(nameof(NotificationEventDtoV1).ToLowerInvariant(), StringComparison.Ordinal):
                await ProcessEventDto<NotificationEventDtoV1>(payload, _notificationEventService.PostEvent).ConfigureAwait(false);
                break;

            default:
                LogErrorByHandlingMessage(_logger, contentType, null);
                break;
        }
    }


    private async Task ProcessEventDto<T>(string payload, Func<T, Task<T>> postEventService)
        where T : IEvent
    {
        var eventDto = JsonSerializer.Deserialize<T>(payload, _jsonSerializerOptions) ?? throw new InvalidOperationException("Deserialization returned null.");

        // Durability is provided by the client's standard resilience handler (retry, circuit breaker,
        // timeouts). A single attempt through the resilient client is all that is needed here; on
        // exhaustion the event is dropped and logged.
        try
        {
            await postEventService(eventDto).ConfigureAwait(false);
            LogPostSuccessful(_logger, eventDto.Id.ToString(CultureInfo.InvariantCulture), eventDto.GetType().Name.ToLower(CultureInfo.CurrentCulture), null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or PleiadesEventPersistenceException)
        {
            LogPostFailed(_logger, eventDto.Id.ToString(CultureInfo.InvariantCulture), ex);
        }
    }

    /// <see cref="IDisposable"/>
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "S3971:\"GC.SuppressFinalize\" should not be called", Justification = "BackgroundService has no Dispose pattern implementation")]
    public override void Dispose()
    {
        _mqttClient.Dispose();
        base.Dispose();
        GC.SuppressFinalize(this);
    }
}
