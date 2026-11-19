using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Polly;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Events.Api.Client.Exceptions;
using Pleiades.Playground.Events.Api.Client.MachineEvents;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Events.Persistence;

/// <summary>
/// Hands every CloudEvent of a machine to the Events API as it came. The events come on
/// <c>machines/{MachineId}/events/jobs|workmasters|notifications</c> with the MQTT 5 content type
/// <c>application/cloudevents+json</c>; the machine id is the second level of the topic. The subscriptions are
/// QoS 1, and the session of the client is persistent (Clean Start false, a session expiry), so the broker keeps
/// the events while this service restarts. A message without that content type, or one that is no JSON object, is
/// logged and dropped; whether it is a valid CloudEvent the Events API decides.
/// <para>
/// A message is acknowledged only once its event is stored, was stored before, or is refused for good. While the
/// Events API is away the handler waits and tries again; the messages behind it wait in the session of the broker,
/// in their order. When the service stops meanwhile, the message stays unacknowledged, and the broker delivers it
/// again after the next connect.
/// </para>
/// </summary>
public class Worker : BackgroundService
{
    /// <summary>The MQTT 5 content type of a CloudEvent in structured mode, without its parameters.</summary>
    public const string CloudEventContentType = "application/cloudevents+json";

    private readonly IMachineEventService _machineEventService;
    private readonly IManagedMqttClient _mqttClient;
    private readonly Config _config;
    private readonly ILogger<Worker> _logger;
    private readonly MqttSubscriptionReadiness _readiness;
    private CancellationToken _stopping = CancellationToken.None;

    private static readonly Action<ILogger, Exception?> LogStarting = LoggerMessage.Define(LogLevel.Information, 0, "Worker is starting.");
    private static readonly Action<ILogger, Exception?> LogStopping = LoggerMessage.Define(LogLevel.Information, 1, "Worker is stopping.");
    private static readonly Action<ILogger, string, string, Exception?> LogPostSuccessful = LoggerMessage.Define<string, string>(LogLevel.Debug, 3, "Event {Id} of {MachineId} stored");
    private static readonly Action<ILogger, string, TimeSpan, Exception?> LogPostFailed = LoggerMessage.Define<string, TimeSpan>(LogLevel.Warning, 4, "Event on {Topic} not stored yet, trying again every {Delay}; the messages behind it wait");
    private static readonly Action<ILogger, string, int, Exception?> LogStoredAfterWaiting = LoggerMessage.Define<string, int>(LogLevel.Information, 5, "Event on {Topic} stored after {Attempts} attempts");
    private static readonly Action<ILogger, string, Exception?> LogLeftUnacknowledged = LoggerMessage.Define<string>(LogLevel.Information, 8, "Event on {Topic} not stored before the stop; the broker delivers it again");
    private static readonly Action<ILogger, string, Exception?> LogAlreadyStored = LoggerMessage.Define<string>(LogLevel.Debug, 7, "Event on {Topic} already stored");
    private static readonly Action<ILogger, string, string, Exception?> LogDropped = LoggerMessage.Define<string, string>(LogLevel.Error, 6, "Message on {Topic} dropped: {Reason}");

    /// <summary>What the log names as the content type of a message that carries none.</summary>
    private const string NoContentType = "(none)";

    public Worker(
        IOptions<Config> config,
        ILogger<Worker> logger,
        IManagedMqttClient mqttClient,
        IMachineEventService machineEventService,
        MqttSubscriptionReadiness readiness)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _readiness = readiness ?? throw new ArgumentNullException(nameof(readiness));
        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
        _machineEventService = machineEventService ?? throw new ArgumentNullException(nameof(machineEventService));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        LogStarting(_logger, null);
        _stopping = stoppingToken;

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
                // QoS 1: an event is delivered at least once; a repeated one the Events API refuses by its id.
                await _mqttClient.SubscribeAsync(topic, MqttQualityOfServiceLevel.AtLeastOnce).ConfigureAwait(false);
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

    /// <summary>The machine id of a topic <c>machines/{MachineId}/events/…</c>, or null for another topic.</summary>
    public static string? MachineIdOf(string topic)
    {
        ArgumentNullException.ThrowIfNull(topic);
        var levels = topic.Split('/');
        return levels.Length >= 4 && levels[0] == "machines" && levels[2] == "events" && levels[1].Length > 0 ? levels[1] : null;
    }

    private async Task HandleMqttData(MqttApplicationMessageReceivedEventArgs args)
    {
        // The handler acknowledges itself: only what is stored, or refused for good, leaves the session.
        args.AutoAcknowledge = false;
        if (await StoreAsync(args).ConfigureAwait(false))
        {
            await args.AcknowledgeAsync(CancellationToken.None).ConfigureAwait(false);
        }
    }

    /// <summary>Stores the event of a message; true when it may be acknowledged, false when the service stops first.</summary>
    private async Task<bool> StoreAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        var message = args.ApplicationMessage.Parse<string>();
        var topic = message.Topic;
        var contentType = message.ContentType;

        // ContentType is an MQTT 5 property; a CloudEvent in structured mode names itself with it. Its parameters
        // (such as charset=utf-8) do not change what it is.
        if (contentType is null || !contentType.Split(';')[0].Trim().Equals(CloudEventContentType, StringComparison.OrdinalIgnoreCase))
        {
            LogDropped(_logger, topic, $"content type {contentType ?? NoContentType}", null);
            return true;
        }
        if (MachineIdOf(topic) is not { } machineId)
        {
            LogDropped(_logger, topic, "no machine id in the topic", null);
            return true;
        }

        JsonElement cloudEvent;
        try
        {
            using var document = JsonDocument.Parse(message.Payload ?? string.Empty);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                LogDropped(_logger, topic, "not a JSON object", null);
                return true;
            }
            cloudEvent = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            LogDropped(_logger, topic, "not JSON", null);
            return true;
        }

        var input = new MachineEventInputDtoV1 { MId = machineId, CloudEvent = cloudEvent };
        var attempt = 0;
        while (true)
        {
            attempt++;
            var outcome = await PostAsync(input, topic).ConfigureAwait(false);
            if (outcome != PostOutcome.TryAgain)
            {
                if (attempt > 1 && outcome == PostOutcome.Stored)
                {
                    LogStoredAfterWaiting(_logger, topic, attempt, null);
                }
                return true;
            }
            if (attempt == 1)
            {
                LogPostFailed(_logger, topic, _config.RetryDelay, null);
            }
            try
            {
                await Task.Delay(_config.RetryDelay, _stopping).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                LogLeftUnacknowledged(_logger, topic, null);
                return false;
            }
        }
    }

    /// <summary>
    /// One attempt to store an event. The client's standard resilience handler retries it for up to two minutes
    /// first (retry, circuit breaker, timeouts). An event stored before, by source and id, is answered with 409:
    /// the broker delivered it again (QoS 1) or a retry followed a write that timed out. It is stored, so that is a
    /// success. Another 4xx refuses the event for good; no answer, a timeout, 408, 429 or 5xx is worth another try.
    /// </summary>
    private async Task<PostOutcome> PostAsync(MachineEventInputDtoV1 input, string topic)
    {
        try
        {
            var stored = await _machineEventService.PostEvent(input).ConfigureAwait(false);
            LogPostSuccessful(_logger, stored.Id, input.MId, null);
            return PostOutcome.Stored;
        }
        catch (PleiadesEventPersistenceException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            LogAlreadyStored(_logger, topic, null);
            return PostOutcome.Stored;
        }
        catch (PleiadesEventPersistenceException ex) when (ex.StatusCode is { } status && IsRefusal(status))
        {
            LogDropped(_logger, topic, $"refused by the Events API: {ex.Message}", null);
            return PostOutcome.Refused;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or ExecutionRejectedException or PleiadesEventPersistenceException)
        {
            return PostOutcome.TryAgain;
        }
    }

    /// <summary>A status that no repetition changes: a 4xx but 408 (timeout), 409 (stored before) and 429 (too many).</summary>
    public static bool IsRefusal(HttpStatusCode status)
    {
        return (int)status is >= 400 and < 500
            && status is not (HttpStatusCode.RequestTimeout or HttpStatusCode.Conflict or HttpStatusCode.TooManyRequests);
    }

    private enum PostOutcome
    {
        Stored,
        Refused,
        TryAgain,
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
