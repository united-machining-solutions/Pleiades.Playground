// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.Json.Nodes;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// Puts the messages of the virtual machine on the broker after the spec binding. Values go out only while there
/// is a connection, since every connect publishes the whole state again. Events go out as CloudEvents through an
/// outbox: while the broker is away they wait there in their order and go out after the next connect, with their
/// source time and their id. The outbox is bounded; when it is full the oldest event is dropped, and the gap stays
/// visible in <c>sequence</c>. <c>Connection.State</c> is the state of the adapter: <c>Initializing</c> until the
/// first connect has sent every value, then <c>Running</c>, <c>CommunicationFault</c> while the machine cannot be
/// reached, and <c>Shutdown</c> at a clean stop.
/// </summary>
internal sealed partial class SpecPublisher : IDisposable
{
    private readonly IManagedMqttClient _client;
    private readonly string _machineId;
    private readonly JsonObject _manifest;
    private readonly string _source;
    private readonly int _capacity;
    private readonly ILogger _logger;
    private readonly Queue<SpecEvent> _outbox = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private bool _initialized;

    /// <summary>The value of <c>Connection.State</c> a running adapter that reaches the machine says.</summary>
    public const string Running = "Running";

    /// <summary>The value of <c>Connection.State</c> while the adapter starts and reads the machine.</summary>
    public const string Initializing = "Initializing";

    /// <summary>The value of <c>Connection.State</c> while the adapter cannot reach the machine.</summary>
    public const string CommunicationFault = "CommunicationFault";

    /// <summary>The value of <c>Connection.State</c> at a clean stop, the last message before it.</summary>
    public const string Shutdown = "Shutdown";

    /// <summary>
    /// The value of <c>Connection.State</c> in the last will. The model has no value for an adapter that is gone;
    /// of its four values <c>CommunicationFault</c> comes closest: the values stand, but they are not current.
    /// </summary>
    public const string LastWillState = CommunicationFault;

    /// <param name="client">The MQTT connection of the spec output.</param>
    /// <param name="machineId">The machine id of the spec binding, a level of every topic.</param>
    /// <param name="manifest">The manifest, published at each connect.</param>
    /// <param name="source">The ProductInstanceUri of the machine, the <c>source</c> of every event.</param>
    /// <param name="capacity">How many events the outbox holds.</param>
    /// <param name="logger">The logger.</param>
    public SpecPublisher(IManagedMqttClient client, string machineId, JsonObject manifest, string source, int capacity, ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
        _client = client;
        _machineId = machineId;
        _manifest = manifest;
        _source = source;
        _capacity = capacity;
        _logger = logger;
    }

    /// <summary>The events that wait in the outbox for a connection.</summary>
    public int Buffered
    {
        get
        {
            lock (_outbox)
            {
                return _outbox.Count;
            }
        }
    }

    /// <summary>Whether the broker is connected.</summary>
    public bool IsConnected => _client.IsConnected;

    /// <summary>How many events the outbox has dropped because it was full.</summary>
    public long Dropped { get; private set; }

    /// <summary>Publishes what the machine said in one step: values if connected, events through the outbox.</summary>
    public async Task PublishAsync(IReadOnlyList<SpecMessage> messages)
    {
        ArgumentNullException.ThrowIfNull(messages);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            foreach (var message in messages)
            {
                switch (message)
                {
                    case SpecValue value when _client.IsConnected:
                        await _client.EnqueueAsync(ValueMessage(value)).ConfigureAwait(false);
                        break;
                    case SpecEvent specEvent:
                        Buffer(specEvent);
                        if (_client.IsConnected)
                        {
                            await DrainAsync().ConfigureAwait(false);
                        }
                        break;
                    default:
                        break;
                }
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// After a connect, and when the machine can be reached again: the manifest, every value, then
    /// <c>Connection/State</c>, and then the events that waited in the outbox. The first time the adapter says
    /// <c>Initializing</c> before all of it. The state at the end is <c>Running</c>, or <c>CommunicationFault</c> when
    /// the machine cannot be reached; so <c>Running</c> never stands over values of an earlier connection. It comes a
    /// millisecond after <c>Initializing</c>, the precision of a timestamp of the model: with the same instant, a store
    /// that reads the newest value could not tell which of the two came last.
    /// </summary>
    public async Task PublishStateAsync(IReadOnlyCollection<SpecValue> values, DateTimeOffset now, bool reachable = true)
    {
        ArgumentNullException.ThrowIfNull(values);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            var waiting = Buffered;
            var ready = now;
            if (!_initialized)
            {
                await _client.EnqueueAsync(ValueMessage(ConnectionState(Initializing, now))).ConfigureAwait(false);
                ready = now.AddMilliseconds(1);
            }
            await _client.EnqueueAsync(Message(SpecWire.ManifestTopic(_machineId), _manifest, retain: true)).ConfigureAwait(false);
            foreach (var value in values)
            {
                await _client.EnqueueAsync(ValueMessage(value)).ConfigureAwait(false);
            }
            await _client.EnqueueAsync(ValueMessage(ConnectionState(reachable ? Running : CommunicationFault, ready))).ConfigureAwait(false);
            _initialized = true;
            await DrainAsync().ConfigureAwait(false);
            LogConnected(values.Count, waiting);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Publishes <c>Connection/State</c>: <c>CommunicationFault</c> when the machine is lost, <c>Shutdown</c> at a
    /// clean stop. Nothing while there is no connection; the next connect publishes the state again.
    /// </summary>
    public async Task PublishConnectionStateAsync(string state, DateTimeOffset now)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_client.IsConnected)
            {
                await _client.EnqueueAsync(ValueMessage(ConnectionState(state, now))).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// The last will: <c>Connection/State</c> <see cref="LastWillState"/>, as the broker publishes it when the
    /// connection breaks off.
    /// </summary>
    public static (string Topic, byte[] Payload) LastWill(string machineId, DateTimeOffset timestamp)
    {
        var will = ConnectionState(LastWillState, timestamp);
        return (SpecWire.Topic(machineId, SpecElements.ConnectionState), Encoding.UTF8.GetBytes(SpecWire.Envelope(will).ToJsonString()));
    }

    public void Dispose()
    {
        _gate.Dispose();
    }

    private void Buffer(SpecEvent specEvent)
    {
        lock (_outbox)
        {
            if (_outbox.Count >= _capacity)
            {
                var dropped = _outbox.Dequeue();
                Dropped++;
                LogDropped(dropped.Sequence, dropped.Path, _capacity);
            }
            _outbox.Enqueue(specEvent);
        }
    }

    private async Task DrainAsync()
    {
        while (_client.IsConnected)
        {
            SpecEvent next;
            lock (_outbox)
            {
                if (!_outbox.TryDequeue(out next!))
                {
                    return;
                }
            }
            await _client.EnqueueAsync(Message(SpecWire.EventTopic(_machineId, next.Path), SpecWire.Event(next, _source), retain: false,
                    SpecWire.EventContentType))
                .ConfigureAwait(false);
        }
    }

    private static SpecValue ConnectionState(string state, DateTimeOffset timestamp)
    {
        return new SpecValue(SpecElements.ConnectionState, JsonValue.Create(state), null, timestamp, null);
    }

    private MqttApplicationMessage ValueMessage(SpecValue value)
    {
        return Message(SpecWire.Topic(_machineId, value.Path), SpecWire.Envelope(value), retain: true);
    }

    private static MqttApplicationMessage Message(string topic, JsonObject payload, bool retain, string contentType = SpecWire.ContentType)
    {
        return new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(payload.ToJsonString()))
            .WithContentType(contentType)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(retain)
            .Build();
    }

    [LoggerMessage(EventId = 110, Level = LogLevel.Information,
        Message = "Spec output connected; published the manifest, {Count} values and {Waiting} waiting events")]
    private partial void LogConnected(int count, int waiting);

    [LoggerMessage(EventId = 111, Level = LogLevel.Warning,
        Message = "Event outbox full ({Capacity}); dropped event {Sequence} ({Event}), a gap in sequence")]
    private partial void LogDropped(string sequence, string @event, int capacity);
}
