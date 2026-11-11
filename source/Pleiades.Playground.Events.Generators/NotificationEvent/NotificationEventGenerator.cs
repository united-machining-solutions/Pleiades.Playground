using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Generators.NotificationEvent;

public class NotificationEventGenerator : INotificationEventGenerator
{
    private readonly ILogger<NotificationEventGenerator> _logger;
    private readonly NotificationEventGeneratorConfig _config;
    private readonly IManagedMqttClient _mqttClient;

    private static readonly Action<ILogger, string, Exception?> LogStarting = LoggerMessage.Define<string>(LogLevel.Information, 0, "Notification event generator starting with config: {Config}");
    private static readonly Action<ILogger, NotificationEventDtoV1, Exception?> LogEvent = LoggerMessage.Define<NotificationEventDtoV1>(LogLevel.Information, 1, "Event published: {Event}");
    private static readonly Action<ILogger, string, string, Exception?> LogSkipped = LoggerMessage.Define<string, string>(LogLevel.Debug, 2, "Skipping notification {NotificationId} (group: {GroupId})");

    public event EventHandler<NotificationEventArgs>? OnEventGenerated;

    public NotificationEventGenerator(IOptions<NotificationEventGeneratorConfig> options, IManagedMqttClient mqttClient, ILogger<NotificationEventGenerator> logger)
    {
        ArgumentNullException.ThrowIfNull(mqttClient);
        ArgumentNullException.ThrowIfNull(options);
        _mqttClient = mqttClient;
        _logger = logger;
        _config = options.Value;
    }

    public async Task StartGeneratingEvents(CancellationToken stoppingToken)
    {
        LogStarting(_logger, JsonSerializer.Serialize(_config, options: JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions), null);
        var iteration = 0;

        while (_config.NumberOfEvents < 0 || iteration < _config.NumberOfEvents)
        {
            var groupFires = BuildGroupFiringDecisions();
            var correlationId = string.Empty;

            foreach (var evt in _config.Events)
            {
                stoppingToken.ThrowIfCancellationRequested();

                if (!ShouldFire(evt, groupFires))
                {
                    LogSkipped(_logger, evt.NotificationId, evt.GroupId ?? "(none)", null);
                    continue;
                }

                if (evt.Action is NotificationAction.Raised)
                {
                    correlationId = ObjectId.GenerateNewId().ToString();
                }

                var model = new NotificationEventDtoV1
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    MId = _config.MId,
                    Timestamp = DateTime.UtcNow,
                    Level = evt.Level,
                    Action = evt.Action,
                    NotificationId = evt.NotificationId,
                    Title = evt.Title,
                    LocalizedTitle = evt.LocalizedTitle,
                    CorrelationId = correlationId,
                };

                // Publish to MQTT topic
                await _mqttClient
                    .Publish($"machines/{model.MId}/events/notifications", model)
                    .ConfigureAwait(false);

                // Trigger .NET event and log
                OnEventGenerated?.Invoke(this, new NotificationEventArgs(model));
                LogEvent(_logger, model, null);

                // Wait for resolved delay
                await Task.Delay(ResolveDelay(evt), stoppingToken).ConfigureAwait(false);
            }

            iteration++;
        }
    }

    /// <summary>
    /// Builds a firing decision per GroupId for this iteration.
    /// Each unique GroupId is rolled once using the FireProbability of the first member encountered.
    /// </summary>
    [SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Not security-critical")]
    private Dictionary<string, bool> BuildGroupFiringDecisions()
    {
        var decisions = new Dictionary<string, bool>(StringComparer.Ordinal);

        foreach (var evt in _config.Events)
        {
            if (evt.GroupId is null)
            {
                continue;
            }

            if (!decisions.ContainsKey(evt.GroupId))
            {
                decisions[evt.GroupId] = Random.Shared.NextDouble() < evt.FireProbability;
            }
        }

        return decisions;
    }

    /// <summary>
    /// Returns whether the given event should fire this iteration.
    /// Grouped events use the pre-computed group decision; standalone events roll independently.
    /// </summary>
    [SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Not security-critical")]
    private static bool ShouldFire(NotificationEventConfig evt, Dictionary<string, bool> groupFires)
    {
        if (evt.GroupId is not null)
        {
            return groupFires.TryGetValue(evt.GroupId, out var fires) && fires;
        }

        return Random.Shared.NextDouble() < evt.FireProbability;
    }

    /// <summary>
    /// Returns the effective delay for an event.
    /// When MaxDelay is set, picks a random value between Delay and MaxDelay.
    /// Otherwise returns Delay unchanged (original behavior).
    /// </summary>
    [SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Not security-critical")]
    private static TimeSpan ResolveDelay(NotificationEventConfig evt)
    {
        if (evt.MaxDelay is null || evt.MaxDelay.Value <= evt.Delay)
        {
            return evt.Delay;
        }

        var randomTicks = evt.Delay.Ticks + (long)(Random.Shared.NextDouble() * (evt.MaxDelay.Value.Ticks - evt.Delay.Ticks));
        return TimeSpan.FromTicks(randomTicks);
    }
}
