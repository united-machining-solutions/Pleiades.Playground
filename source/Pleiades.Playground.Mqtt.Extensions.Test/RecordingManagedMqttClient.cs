using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using MQTTnet;
using MQTTnet.Packets;

namespace Pleiades.Playground.Mqtt.Extensions.Testing;

/// <summary>
/// A managed client without a broker for the tests of producers: it records what is enqueued, and the test decides
/// when it is connected. The adapters' tests link this file.
/// </summary>
internal sealed class RecordingManagedMqttClient : IManagedMqttClient
{
    private readonly List<Func<MqttClientConnectedEventArgs, Task>> _connected = [];
    private volatile bool _isConnected;

    public RecordingManagedMqttClient(bool connected = true)
    {
        _isConnected = connected;
    }

    /// <summary>Every message enqueued, in order.</summary>
    public ConcurrentQueue<MqttApplicationMessage> Messages { get; } = new();

    /// <summary>The options the client was started with.</summary>
    public ManagedMqttClientOptions? Options { get; private set; }

    public IMqttClient InternalClient { get; } = new MqttClientFactory().CreateMqttClient();

    public bool IsConnected => _isConnected;

    public bool IsStarted { get; private set; }

    public int PendingApplicationMessagesCount => 0;

    public event Func<MqttApplicationMessageReceivedEventArgs, Task> ApplicationMessageReceivedAsync { add { } remove { } }

    public event Func<MqttClientConnectedEventArgs, Task> ConnectedAsync
    {
        add { lock (_connected) _connected.Add(value); }
        remove { lock (_connected) _connected.Remove(value); }
    }

    public event Func<MqttClientDisconnectedEventArgs, Task> DisconnectedAsync { add { } remove { } }

    public event Func<ConnectingFailedEventArgs, Task> ConnectingFailedAsync { add { } remove { } }

    public event Func<ApplicationMessageSkippedEventArgs, Task> ApplicationMessageSkippedAsync { add { } remove { } }

    public event Func<SubscriptionsChangedEventArgs, Task> SubscriptionsChangedAsync { add { } remove { } }

    /// <summary>The connection is lost: nothing is enqueued by a producer that checks it.</summary>
    public void Disconnect() => _isConnected = false;

    /// <summary>A connect: connected, and every handler of <see cref="ConnectedAsync"/> runs.</summary>
    public async Task ConnectAsync()
    {
        _isConnected = true;
        Func<MqttClientConnectedEventArgs, Task>[] handlers;
        lock (_connected) handlers = [.. _connected];
        foreach (var handler in handlers)
        {
            await handler(null!).ConfigureAwait(false);
        }
    }

    /// <summary>The messages so far as (topic, payload) and forgets them.</summary>
    public List<MqttApplicationMessage> Take()
    {
        var taken = new List<MqttApplicationMessage>();
        while (Messages.TryDequeue(out var message)) taken.Add(message);
        return taken;
    }

    public Task StartAsync(ManagedMqttClientOptions options)
    {
        Options = options;
        IsStarted = true;
        return Task.CompletedTask;
    }

    public Task StopAsync(bool cleanDisconnect = true)
    {
        IsStarted = false;
        return Task.CompletedTask;
    }

    /// <summary>The enqueue with this number from now on (1 is the next one) throws, once.</summary>
    public int FailAt { get; set; }

    /// <summary>While set, an enqueue waits until it completes.</summary>
    public TaskCompletionSource? Hold { get; set; }

    public async Task EnqueueAsync(MqttApplicationMessage applicationMessage)
    {
        if (FailAt > 0 && --FailAt == 0)
        {
            throw new InvalidOperationException("The queue refuses the message.");
        }
        if (Hold is { } hold)
        {
            await hold.Task.ConfigureAwait(false);
        }
        Messages.Enqueue(applicationMessage);
    }

    public Task SubscribeAsync(IEnumerable<MqttTopicFilter> topicFilters) => Task.CompletedTask;

    public Task UnsubscribeAsync(IEnumerable<string> topics) => Task.CompletedTask;

    public void Dispose() => InternalClient.Dispose();

    /// <summary>The payload of a message as JSON.</summary>
    public static JsonObject Json(MqttApplicationMessage message)
        => JsonNode.Parse(message.ConvertPayloadToString())!.AsObject();
}

/// <summary>A clock the test moves by hand.</summary>
internal sealed class ManualTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
