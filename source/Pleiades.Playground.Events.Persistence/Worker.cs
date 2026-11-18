using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
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

    private static readonly Action<ILogger, Exception?> LogStarting = LoggerMessage.Define(LogLevel.Information, 0, "Worker is starting.");
    private static readonly Action<ILogger, Exception?> LogStopping = LoggerMessage.Define(LogLevel.Information, 1, "Worker is stopping.");
    private static readonly Action<ILogger, string, string, Exception?> LogPostSuccessful = LoggerMessage.Define<string, string>(LogLevel.Debug, 3, "Event {Id} of {MachineId} stored");
    private static readonly Action<ILogger, string, Exception?> LogPostFailed = LoggerMessage.Define<string>(LogLevel.Warning, 4, "Event on {Topic} not stored");
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
        var message = args.ApplicationMessage.Parse<string>();
        var topic = message.Topic;
        var contentType = message.ContentType;

        // ContentType is an MQTT 5 property; a CloudEvent in structured mode names itself with it. Its parameters
        // (such as charset=utf-8) do not change what it is.
        if (contentType is null || !contentType.Split(';')[0].Trim().Equals(CloudEventContentType, StringComparison.OrdinalIgnoreCase))
        {
            LogDropped(_logger, topic, $"content type {contentType ?? NoContentType}", null);
            return;
        }
        if (MachineIdOf(topic) is not { } machineId)
        {
            LogDropped(_logger, topic, "no machine id in the topic", null);
            return;
        }

        JsonElement cloudEvent;
        try
        {
            using var document = JsonDocument.Parse(message.Payload ?? string.Empty);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                LogDropped(_logger, topic, "not a JSON object", null);
                return;
            }
            cloudEvent = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            LogDropped(_logger, topic, "not JSON", null);
            return;
        }

        // Durability is provided by the client's standard resilience handler (retry, circuit breaker,
        // timeouts). On exhaustion the event is logged and not stored. An event stored before, by source and id,
        // is answered with 409: the broker delivered it again (QoS 1) or a retry followed a write that timed out.
        // It is stored, so that is a success.
        try
        {
            var stored = await _machineEventService.PostEvent(new MachineEventInputDtoV1 { MId = machineId, CloudEvent = cloudEvent }).ConfigureAwait(false);
            LogPostSuccessful(_logger, stored.Id, machineId, null);
        }
        catch (PleiadesEventPersistenceException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            LogAlreadyStored(_logger, topic, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or PleiadesEventPersistenceException)
        {
            LogPostFailed(_logger, topic, ex);
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
