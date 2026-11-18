using System.Buffers;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>
/// Reads the configured topics at the MQTT broker and sends every message of the MQTT binding on to NATS as a
/// CloudEvent (see <see cref="CloudEventMapper"/>). The subscriptions are QoS 1 in a persistent session, so the broker
/// keeps what comes while the bridge restarts. The messages are handled one after the other, and a message is
/// acknowledged to the broker only when its handling ends:
/// <list type="bullet">
/// <item>While NATS is not connected the message waits, and so does everything behind it, at the broker.</item>
/// <item>A publish that fails while connected (no stream, no permission) is tried again
/// <see cref="NatsConfig.PublishAttempts"/> times, then logged and dropped.</item>
/// </list>
/// </summary>
internal sealed partial class Worker : BackgroundService
{
    private readonly IManagedMqttClient _mqttClient;
    private readonly ICloudEventPublisher _publisher;
    private readonly Config _config;
    private readonly ILogger<Worker> _logger;
    private readonly MqttSubscriptionReadiness _readiness;
    private readonly TimeProvider _time;
    private readonly PublishOutcome _outcome;

    private static readonly TimeSpan ConnectionPoll = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromMinutes(1);
    private CancellationToken _stopping;

    public Worker(
        IOptions<Config> config,
        ILogger<Worker> logger,
        IManagedMqttClient mqttClient,
        ICloudEventPublisher publisher,
        MqttSubscriptionReadiness readiness,
        PublishOutcome outcome,
        TimeProvider? time = null)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
        _publisher = publisher ?? throw new ArgumentNullException(nameof(publisher));
        _readiness = readiness ?? throw new ArgumentNullException(nameof(readiness));
        _outcome = outcome ?? throw new ArgumentNullException(nameof(outcome));
        _time = time ?? TimeProvider.System;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        LogStarting(_config.Nats.Url, _config.Nats.SubjectPrefix, _config.Nats.JetStream);

        _publisher.StartConnecting();

        // Handler FIRST, then subscribe: the other order drops whatever arrives in between.
        _mqttClient.ApplicationMessageReceivedAsync += HandleMessageAsync;
        _mqttClient.SubscriptionsChangedAsync += _readiness.HandleSubscriptionsChangedAsync;

        try
        {
            _readiness.MarkRequested(_config.Topics);
            foreach (var topic in _config.Topics)
            {
                await _mqttClient.SubscribeAsync(topic, MqttQualityOfServiceLevel.AtLeastOnce).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _readiness.MarkFaulted($"subscribe failed: {ex.Message}");
            throw;
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            LogStopping();
        }
        finally
        {
            await _mqttClient.StopAsync().ConfigureAwait(false);
        }
    }

    internal async Task HandleMessageAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        var message = args.ApplicationMessage;
        if (message.Retain && !_config.ForwardRetained)
        {
            return;
        }

        // An empty payload clears a retained value at the broker: there is no value to send on.
        if (message.Payload.IsEmpty)
        {
            return;
        }

        var input = new MqttInput(message.Topic, message.Payload.ToArray(), message.ContentType, message.Retain);
        if (CloudEventMapper.Map(input, _config.Nats.SubjectPrefix, out var reason) is not { } cloudEvent)
        {
            LogDropped(message.Topic, reason ?? "unknown");
            return;
        }

        var delay = _config.Nats.RetryDelay;
        var attempts = _config.Nats.PublishAttempts;
        var attempt = 0;
        var waited = false;
        while (true)
        {
            // While NATS is away the message waits, unacknowledged: the broker keeps what follows in the session.
            // No attempt is counted for that wait.
            if (!_publisher.IsConnected)
            {
                if (!waited)
                {
                    LogWaiting(cloudEvent.Subject);
                    waited = true;
                }
                await Task.Delay(ConnectionPoll, _time, _stopping).ConfigureAwait(false);
                continue;
            }

            attempt++;
            try
            {
                await _publisher.PublishAsync(cloudEvent, _stopping).ConfigureAwait(false);
                _outcome.Succeeded();
                LogPublished(cloudEvent.Subject, cloudEvent.Id);
                return;
            }
            catch (OperationCanceledException) when (_stopping.IsCancellationRequested)
            {
                // Stopping: the handler throws, so the message is not acknowledged; the broker keeps it in the
                // persistent session and sends it again after the restart.
                throw;
            }
            catch (Exception ex) when (attempt < attempts)
            {
                LogRetry(cloudEvent.Subject, attempt, ex.Message);
                await Task.Delay(delay, _time, _stopping).ConfigureAwait(false);
                delay = delay * 2 > MaxRetryDelay ? MaxRetryDelay : delay * 2;
            }
            catch (Exception ex)
            {
                _outcome.Dropped(ex.Message);
                LogPublishFailed(ex, cloudEvent.Subject, cloudEvent.Id, attempt);
                return;
            }
        }
    }

    public override void Dispose()
    {
        _mqttClient.Dispose();
        base.Dispose();
    }

    [LoggerMessage(0, LogLevel.Information, "Bridge starts: NATS {Url}, subjects {Prefix}.>, JetStream {JetStream}")]
    private partial void LogStarting(string url, string prefix, bool jetStream);

    [LoggerMessage(1, LogLevel.Information, "Bridge stops")]
    private partial void LogStopping();

    [LoggerMessage(2, LogLevel.Debug, "CloudEvent {Id} sent on {Subject}")]
    private partial void LogPublished(string subject, string id);

    [LoggerMessage(3, LogLevel.Debug, "Message on {Topic} not sent on: {Reason}")]
    private partial void LogDropped(string topic, string reason);

    [LoggerMessage(4, LogLevel.Information, "Publish on {Subject} failed (attempt {Attempt}), tried again: {Error}")]
    private partial void LogRetry(string subject, int attempt, string error);

    [LoggerMessage(6, LogLevel.Warning, "NATS is not connected; {Subject} and what follows wait")]
    private partial void LogWaiting(string subject);

    [LoggerMessage(5, LogLevel.Warning, "CloudEvent {Id} on {Subject} dropped after {Attempts} attempts")]
    private partial void LogPublishFailed(Exception exception, string subject, string id, int attempts);
}
