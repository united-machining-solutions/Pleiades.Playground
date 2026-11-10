using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using MQTTnet.Extensions.ManagedClient;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Timeseries.Generators.BaseUnitValue;

public class BaseUnitValueGenerator : IBaseUnitValueGenerator
{
    private static readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

    private readonly Random _random;
    private readonly IManagedMqttClient _mqttClient;
    private readonly ConcurrentDictionary<string, double> _lastIncrementalValues = new();
    private readonly string _persistenceFilePath;
    private readonly BaseUnitValueGeneratorConfig _config;
    private readonly ILogger<BaseUnitValueGenerator> _logger;

    public event EventHandler<MessageGeneratedEventArgs<BaseUnitValueDto>>? MessageGenerated;

    public BaseUnitValueGenerator(IOptions<BaseUnitValueGeneratorConfig> config, IManagedMqttClient mqttClient, ILogger<BaseUnitValueGenerator> logger)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _random = new Random();

        // determine persistence path: config override -> /data (container-friendly) -> app folder
        if (!string.IsNullOrWhiteSpace(_config.PersistenceFilePath))
        {
            _persistenceFilePath = _config.PersistenceFilePath!;
        }
        else
        {
            var candidate = Path.Combine("/data", "last_incremental_values.json");
            if (Directory.Exists("/data"))
            {
                _persistenceFilePath = candidate;
            }
            else
            {
                _persistenceFilePath = Path.Combine(AppContext.BaseDirectory, "last_incremental_values.json");
            }
        }
        TryLoadPersistedValues();
    }

    // LoggerMessage templates
    private static readonly Action<ILogger, string, Exception?> LogPersistOnShutdownFailed =
        LoggerMessage.Define<string>(LogLevel.Warning, new EventId(1, nameof(LogPersistOnShutdownFailed)), "Persisting incremental values on shutdown failed for file {PersistenceFile}");

    private static readonly Action<ILogger, string, Exception?> LogPeriodicPersistFailed =
        LoggerMessage.Define<string>(LogLevel.Warning, new EventId(2, nameof(LogPeriodicPersistFailed)), "Periodic persistence failed for file {PersistenceFile}");

    private static readonly Action<ILogger, Exception?> LogLoadPersistFailed =
        LoggerMessage.Define( LogLevel.Warning, new EventId(3, nameof(LogLoadPersistFailed)), "Loading persisted incremental values failed or file was corrupt");

    private static readonly Action<ILogger, Exception?> LogPersistValuesFailed =
        LoggerMessage.Define( LogLevel.Warning, new EventId(4, nameof(LogPersistValuesFailed)), "Persisting incremental values failed");

    private static readonly Action<ILogger, string, Exception?> LogNoPersistFileFound =
        LoggerMessage.Define<string>(LogLevel.Information, new EventId(5, nameof(LogNoPersistFileFound)), "No persistence file found at {PersistenceFile}");

    private static readonly Action<ILogger, int, string, Exception?> LogLoadedPersistedValues =
        LoggerMessage.Define<int, string>(LogLevel.Information, new EventId(6, nameof(LogLoadedPersistedValues)), "Loaded {Count} persisted incremental values from {PersistenceFile}");

    private static readonly Action<ILogger, string, Exception?> LogLoadedPersistedValuesDebug =
        LoggerMessage.Define<string>(LogLevel.Debug, new EventId(7, nameof(LogLoadedPersistedValuesDebug)), "Persisted incremental values content: {Content}");

    public void StartGeneratingValues(CancellationToken stoppingToken)
    {
        // Persist values once on stop (best-effort, synchronous)
        stoppingToken.Register(() =>
        {
            try
            {
                PersistValues();
            }
            catch (Exception ex)
            {
                LogPersistOnShutdownFailed(_logger, _persistenceFilePath, ex);
            }
        });

        // start periodic persistence if configured
        if (_config.PersistenceInterval.HasValue && _config.PersistenceInterval.Value > TimeSpan.Zero)
        {
            var interval = _config.PersistenceInterval.Value;
            _ = Task.Run(async () =>
            {
                    while (!stoppingToken.IsCancellationRequested)
                    {
                        try
                        {
                            await Task.Delay(interval, stoppingToken).ConfigureAwait(false);
                            PersistValues();
                        }
                        catch (OperationCanceledException)
                        {
                            break;
                        }
                        catch (Exception ex)
                        {
                            LogPeriodicPersistFailed(_logger, _persistenceFilePath, ex);
                        }
                    }
            }, CancellationToken.None);
        }

        foreach (var topicConfig in _config.Topics)
        {
            _ = Task.Run(async () =>
            {
                long count = 0;

                var fullTopic = _config.BaseTopic + topicConfig.Topic;

                Func<BaseUnit, TopicConfig, BaseUnitValueDto> func = topicConfig.GeneratorType switch
                {
                    BaseUnitValueGeneratorType.Random => GenerateRandomBaseUnitValue,
                    BaseUnitValueGeneratorType.Sine => GenerateSineBaseUnitValue,
                    BaseUnitValueGeneratorType.Linear => GenerateLinearBaseUnitValue,
                    BaseUnitValueGeneratorType.Incremental => GenerateIncrementalBaseUnitValue,
                    BaseUnitValueGeneratorType.Square => GenerateSquareBaseUnitValue,
                    _ => throw new ArgumentException("Invalid generator type")
                };

                while (!stoppingToken.IsCancellationRequested && (topicConfig.NumberOfMessages < 0 || count < topicConfig.NumberOfMessages))
                {
                    var message = func(topicConfig.Unit, topicConfig);
                    await _mqttClient.Publish(fullTopic, message).ConfigureAwait(false);
                    MessageGenerated?.Invoke(this, new MessageGeneratedEventArgs<BaseUnitValueDto>
                    {
                        Topic = fullTopic,
                        Message = message
                    });
                    await Task.Delay(topicConfig.Delay, stoppingToken).ConfigureAwait(false);
                    count++;
                }
            }, stoppingToken);
        }
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "CA5394:Use cryptographically secure random number generators when randomness is required for security", Justification = "Only for generating sample data")]
    private BaseUnitValueDto GenerateRandomBaseUnitValue(BaseUnit unit, TopicConfig config)
    {
        double baseValue = _random.NextDouble();
        double scaledValue = baseValue * config.Scale + config.Offset;

        return new BaseUnitValueDto
        {
            Timestamp = DateTime.UtcNow,
            Unit = unit,
            Value = scaledValue
        };
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "CA5394:Use cryptographically secure random number generators when randomness is required for security", Justification = "Only for generating sample data")]
    private BaseUnitValueDto GenerateSineBaseUnitValue(BaseUnit unit, TopicConfig config)
    {
        double timeInSeconds = (DateTime.Now - new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        double sineValue = config.Scale * Math.Sin(2 * Math.PI * config.Frequency * timeInSeconds) + config.Offset;
        double noise = config.NoiseScale > 0 ? (_random.NextDouble() * 2 - 1) * config.NoiseScale : 0;
        double finalValue = sineValue + noise;

        return new BaseUnitValueDto
        {
            Timestamp = DateTime.Now,
            Unit = unit,
            Value = finalValue
        };
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "CA5394:Use cryptographically secure random number generators when randomness is required for security", Justification = "Only for generating sample data")]
    private BaseUnitValueDto GenerateLinearBaseUnitValue(BaseUnit unit, TopicConfig config)
    {
        DateTime now = DateTime.UtcNow;
        DateTime start = config.StartDateTimeUtc ?? new DateTime(2025, 5, 14, 0, 0, 0, DateTimeKind.Utc);
        double elapsedSeconds = (now - start).TotalSeconds;

        double value = config.Scale * elapsedSeconds;

        return new BaseUnitValueDto
        {
            Timestamp = now,
            Unit = unit,
            Value = value
        };
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "CA5394:Use cryptographically secure random number generators when randomness is required for security", Justification = "Only for generating sample data")]
    private BaseUnitValueDto GenerateIncrementalBaseUnitValue(BaseUnit unit, TopicConfig config)
    {
        DateTime now = DateTime.UtcNow;

        string topicKey = config.Topic;
        if (!_lastIncrementalValues.TryGetValue(topicKey, out double lastValue))
        {
            lastValue = 0.0;
        }

        double increment = config.Scale * config.Delay.TotalSeconds;
        double noise = (_random.NextDouble() * 2 - 1) * config.NoiseScale;

        double delta = increment + noise;
        if (delta < 0)
        {
            delta = 0;
        }
        double newValue = lastValue + delta;
        _lastIncrementalValues[topicKey] = newValue;

        return new BaseUnitValueDto
        {
            Timestamp = now,
            Unit = unit,
            Value = newValue
        };
    }

    private static BaseUnitValueDto GenerateSquareBaseUnitValue(BaseUnit unit, TopicConfig config)
    {
        var now = DateTime.UtcNow;
        var timeInSeconds = (now - new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        var period = config.LowDuration.TotalSeconds + config.HighDuration.TotalSeconds;
        var phase = timeInSeconds % period;
        var value = phase < config.LowDuration.TotalSeconds ? config.LowValue : config.HighValue;

        return new BaseUnitValueDto
        {
            Timestamp = now,
            Unit = unit,
            Value = value
        };
    }

    private void TryLoadPersistedValues()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_persistenceFilePath))
            {
                LogNoPersistFileFound(_logger, "<empty>", null);
                return;
            }
            if (!File.Exists(_persistenceFilePath))
            {
                LogNoPersistFileFound(_logger, _persistenceFilePath, null);
                return;
            }
            var json = File.ReadAllText(_persistenceFilePath);
            var dict = JsonSerializer.Deserialize<Dictionary<string, double>>(json);
            if (dict is null)
            {
                LogLoadedPersistedValues(_logger, 0, _persistenceFilePath, null);
                return;
            }
            foreach (var kv in dict)
            {
                _lastIncrementalValues[kv.Key] = kv.Value;
            }
            LogLoadedPersistedValues(_logger, dict.Count, _persistenceFilePath, null);

            var serialized = JsonSerializer.Serialize(dict, _jsonOptions);
            LogLoadedPersistedValuesDebug(_logger, serialized, null);

        }
        catch (Exception ex)
        {
            // If file is corrupt or unreadable, ignore and start fresh
            LogLoadPersistFailed(_logger, ex);
        }
    }

    private void PersistValues()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_persistenceFilePath))
            {
                return;
            }
            var snapshot = new Dictionary<string, double>(_lastIncrementalValues);
            var json = JsonSerializer.Serialize(snapshot, _jsonOptions);

            var tmp = _persistenceFilePath + ".tmp";
            File.WriteAllText(tmp, json);
            File.Move(tmp, _persistenceFilePath, overwrite: true);
        }
        catch (Exception ex)
        {
            // best-effort, log and ignore errors
            LogPersistValuesFailed(_logger, ex);
        }
    }
}
