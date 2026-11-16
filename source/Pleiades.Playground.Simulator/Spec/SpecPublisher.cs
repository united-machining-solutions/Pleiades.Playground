// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.Json.Nodes;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// Puts the messages of the virtual machine on the broker after the spec binding. Values go out only while there
/// is a connection, since every connect publishes the whole state again. Events go through an outbox: while the
/// broker is away they wait there in their order and go out after the next connect, with their source time. The
/// outbox is bounded; when it is full the oldest event is dropped, and the gap stays visible in <c>seq</c>.
/// </summary>
internal sealed partial class SpecPublisher : IDisposable
{
    private readonly IManagedMqttClient _client;
    private readonly string _machineId;
    private readonly JsonObject _manifest;
    private readonly string _seqEpoch;
    private readonly int _capacity;
    private readonly ILogger _logger;
    private readonly Queue<SpecEvent> _outbox = new();
    private readonly SemaphoreSlim _gate = new(1, 1);

    public SpecPublisher(IManagedMqttClient client, string machineId, JsonObject manifest, string seqEpoch, int capacity, ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
        _client = client;
        _machineId = machineId;
        _manifest = manifest;
        _seqEpoch = seqEpoch;
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
    /// After a connect: <c>Connection/State</c> Disconnected, the manifest, every value, Connected, and then the
    /// events that waited in the outbox. So Connected never stands over values of an earlier connection.
    /// </summary>
    public async Task PublishStateAsync(IReadOnlyCollection<SpecValue> values, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(values);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            var waiting = Buffered;
            await _client.EnqueueAsync(ValueMessage(ConnectionState("Disconnected", now))).ConfigureAwait(false);
            await _client.EnqueueAsync(Message(SpecWire.ManifestTopic(_machineId), _manifest, retain: true)).ConfigureAwait(false);
            foreach (var value in values)
            {
                await _client.EnqueueAsync(ValueMessage(value)).ConfigureAwait(false);
            }
            await _client.EnqueueAsync(ValueMessage(ConnectionState("Connected", now))).ConfigureAwait(false);
            await DrainAsync().ConfigureAwait(false);
            LogConnected(values.Count, waiting);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Publishes <c>Connection/State</c>, for a clean stop.</summary>
    public async Task PublishConnectionStateAsync(string state, DateTimeOffset now)
    {
        await _client.EnqueueAsync(ValueMessage(ConnectionState(state, now))).ConfigureAwait(false);
    }

    /// <summary>The last will: <c>Connection/State</c> Disconnected, as the broker publishes it.</summary>
    public static (string Topic, byte[] Payload) LastWill(string machineId, DateTimeOffset timestamp)
    {
        var will = ConnectionState("Disconnected", timestamp);
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
                LogDropped(dropped.Seq, dropped.Path, _capacity);
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
            await _client.EnqueueAsync(Message(SpecWire.EventTopic(_machineId, next.Path), SpecWire.Event(next, _seqEpoch), retain: false))
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

    private static MqttApplicationMessage Message(string topic, JsonObject payload, bool retain)
    {
        return new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(payload.ToJsonString()))
            .WithContentType(SpecWire.ContentType)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(retain)
            .Build();
    }

    [LoggerMessage(EventId = 110, Level = LogLevel.Information,
        Message = "Spec output connected; published the manifest, {Count} values and {Waiting} waiting events")]
    private partial void LogConnected(int count, int waiting);

    [LoggerMessage(EventId = 111, Level = LogLevel.Warning,
        Message = "Event outbox full ({Capacity}); dropped event {Seq} ({Event}), a gap in seq")]
    private partial void LogDropped(long seq, string @event, int capacity);
}
