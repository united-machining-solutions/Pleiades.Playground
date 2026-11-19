using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Bend.Adapter;

/// <summary>
/// Publishes as the MQTT binding of machines says, with the publisher the other adapters of real devices share
/// (<see cref="MachinePublisher"/>): the manifest before the values, every value retained with QoS 1 in the envelope
/// <c>{timestamp, value, unit}</c>, <c>Connection/State</c> as the state of the adapter, and a value when it
/// changes. The events of the group <c>Notification</c> go out as CloudEvents on
/// <c>machines/{MachineId}/events/notifications</c>, QoS 1, not retained, numbered in <c>sequence</c>; while the
/// broker is away they wait in the bounded outbox of the publisher and go out after the next connect sequence.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed class MqttPublisher : IPublisher, IDisposable
{
    /// <summary>The MQTT 5 content type of an event.</summary>
    internal const string EventContentType = "application/cloudevents+json; charset=utf-8";

    /// <summary>The <c>dataschema</c> of every event: the event schema of the model version.</summary>
    internal const string EventDataSchema = $"urn:umati2:datamodel:{MachineBinding.ModelVersion}:event.schema.json";

    private readonly MachineIdentity _identity;
    private readonly TimeProvider _time;
    private readonly MachinePublisher _machine;
    private readonly Dictionary<string, MachineValue> _values = new(StringComparer.Ordinal);
    private readonly List<EventPublication> _heldEvents = [];
    private readonly string _sequencePrefix;
    private long _notifications;

    public MqttPublisher(IManagedMqttClient client, MachineIdentity identity, IOptions<Config> config, TimeProvider time, ILogger<MqttPublisher> logger)
    {
        ArgumentNullException.ThrowIfNull(config);
        _identity = identity;
        _time = time;
        _machine = new MachinePublisher(client, identity, Manifest(identity, config.Value.HeartbeatInterval), time, logger);
        _sequencePrefix = time.GetUtcNow().UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// The manifest: the profile Core with the snapshot <c>State.Status</c> and the alerts, the signals of the
    /// manufacturer, and the events of the group <c>Notification</c>.
    /// </summary>
    internal static JsonObject Manifest(MachineIdentity identity, TimeSpan heartbeatInterval)
    {
        ArgumentNullException.ThrowIfNull(identity);
        var manifest = MachineManifest.Build(identity, heartbeatInterval, BendTranslator.Elements(identity));
        manifest["events"] = new JsonArray(
            new JsonObject { ["path"] = Paths.AlertRaised },
            new JsonObject { ["path"] = Paths.AlertCleared },
            new JsonObject { ["path"] = Paths.NotificationEvent });
        return manifest;
    }

    public Task StartAsync() => _machine.AttachAsync();

    public Task ReachedAsync(IReadOnlyList<Publication> publications) => PublishAsync(publications, reached: true);

    public Task SaidAsync(IReadOnlyList<Publication> publications) => PublishAsync(publications, reached: false);

    /// <summary>
    /// The values go to the publisher together, so that <c>Running</c> follows all of them. A path that changes twice
    /// in one batch goes out first, so that both of its values are seen. While the machine counts as not reached,
    /// values and events are only kept: they go out with the next <c>Running</c>, the events after the values, so that
    /// the events and <c>ActiveAlerts</c> tell the same.
    /// </summary>
    private async Task PublishAsync(IReadOnlyList<Publication> publications, bool reached)
    {
        ArgumentNullException.ThrowIfNull(publications);
        var send = reached || _machine.Reachable == true;
        var pending = new HashSet<string>(StringComparer.Ordinal);
        foreach (var publication in publications)
        {
            switch (publication)
            {
                case ValuePublication value:
                    if (!pending.Add(value.Path) && send)
                    {
                        await FlushAsync(pending).ConfigureAwait(false);
                        pending.Add(value.Path);
                    }

                    _values[value.Path] = new MachineValue(value.Path, value.Value?.DeepClone(), value.Timestamp, value.Unit);
                    break;
                case EventPublication held when !send:
                    _heldEvents.Add(held);
                    break;
                case EventPublication notification:
                    await FlushAsync(pending).ConfigureAwait(false);
                    await _machine.EventAsync(Event(notification, ++_notifications)).ConfigureAwait(false);
                    break;
            }
        }

        if (send)
        {
            await FlushAsync(pending, force: reached && _machine.Reachable != true).ConfigureAwait(false);
            foreach (var held in _heldEvents)
            {
                await _machine.EventAsync(Event(held, ++_notifications)).ConfigureAwait(false);
            }

            _heldEvents.Clear();
        }
    }

    /// <summary>
    /// Hands every value to the publisher, which sends those that changed. <paramref name="force"/>: also without a
    /// pending value, so that a machine that is there again is reported as reached.
    /// </summary>
    private async Task FlushAsync(HashSet<string> pending, bool force = false)
    {
        if (pending.Count == 0 && !force)
        {
            return;
        }

        pending.Clear();
        await _machine.ReachedAsync(_values.Values, _time.GetUtcNow()).ConfigureAwait(false);
    }

    public Task LostAsync() => _machine.LostAsync(_time.GetUtcNow());

    public Task HeartbeatAsync() => _machine.HeartbeatAsync(_time.GetUtcNow());

    public Task ShutdownAsync() => _machine.ShutdownAsync(_time.GetUtcNow(), TimeSpan.FromSeconds(5));

    public void Dispose() => _machine.Dispose();

    /// <summary>
    /// An event as a CloudEvent 1.0, structured mode: <c>source</c> the <c>ProductInstanceUri</c>, <c>type</c> the
    /// path of the event, <c>sequence</c> the start of the adapter and the count of the event in the group
    /// <c>Notification</c>, and the alert or notification as <c>data</c>.
    /// </summary>
    internal MqttApplicationMessage Event(EventPublication notification, long count)
    {
        var cloudEvent = new JsonObject
        {
            ["specversion"] = "1.0",
            ["id"] = Guid.NewGuid().ToString(),
            ["source"] = _identity.EffectiveProductInstanceUri,
            ["type"] = notification.Type,
            ["time"] = MachineBinding.Timestamp(notification.Timestamp),
            ["sequence"] = string.Create(CultureInfo.InvariantCulture, $"{_sequencePrefix}.{count:D12}"),
            ["dataschema"] = EventDataSchema,
            ["data"] = notification.Data.DeepClone(),
        };
        return new MqttApplicationMessageBuilder()
            .WithTopic($"{MachineBinding.Root}/{_identity.MachineId}/events/notifications")
            .WithPayload(Encoding.UTF8.GetBytes(cloudEvent.ToJsonString()))
            .WithContentType(EventContentType)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(false)
            .Build();
    }
}
