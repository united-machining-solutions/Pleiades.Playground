using System.Collections.Concurrent;
using MQTTnet;
using MQTTnet.Diagnostics.PacketInspection;

namespace Pleiades.Playground.Mqtt.Extensions.Test;

/// <summary>
/// An <see cref="IMqttClient"/> without a broker: the test decides how a connect ends and when the
/// connection is lost, and reads what the managed client sent.
/// </summary>
internal sealed class FakeMqttClient : IMqttClient
{
    private volatile bool _isConnected;
    private int _connectAttempts;

    /// <summary>How the next connect attempts end. Default: the broker accepts.</summary>
    public Func<MqttClientConnectResult> OnConnect { get; set; } = Accepted;

    /// <summary>Awaited before a connect attempt ends, with the token the caller passed.</summary>
    public Func<CancellationToken, Task>? WhileConnecting { get; set; }

    /// <summary>Awaited before a SUBSCRIBE is answered, after it was recorded.</summary>
    public Func<CancellationToken, Task>? WhileSubscribing { get; set; }

    /// <summary>Runs before a publish is recorded; throws to make the publish fail.</summary>
    public Action<MqttApplicationMessage>? OnPublish { get; set; }

    public int ConnectAttempts => Volatile.Read(ref _connectAttempts);

    public ConcurrentQueue<MqttClientSubscribeOptions> Subscribes { get; } = new();

    public ConcurrentQueue<MqttClientUnsubscribeOptions> Unsubscribes { get; } = new();

    public ConcurrentQueue<MqttApplicationMessage> Published { get; } = new();

    public int Disconnects { get; private set; }

    public bool IsDisposed { get; private set; }

    public bool IsConnected => _isConnected;

    public MqttClientOptions Options { get; private set; } = new();

    public event Func<MqttApplicationMessageReceivedEventArgs, Task>? ApplicationMessageReceivedAsync;

    public event Func<MqttClientConnectedEventArgs, Task>? ConnectedAsync;

    public event Func<MqttClientConnectingEventArgs, Task>? ConnectingAsync;

    public event Func<MqttClientDisconnectedEventArgs, Task>? DisconnectedAsync;

    public event Func<InspectMqttPacketEventArgs, Task>? InspectPacketAsync;

    public static MqttClientConnectResult Accepted() => new() { ResultCode = MqttClientConnectResultCode.Success };

    public static MqttClientConnectResult Refused() => new() { ResultCode = MqttClientConnectResultCode.NotAuthorized };

    /// <summary>The broker, or the network, ends the connection.</summary>
    public async Task LoseConnectionAsync()
    {
        _isConnected = false;
        if (DisconnectedAsync is { } handlers)
        {
            await handlers(new MqttClientDisconnectedEventArgs(
                true, null, MqttClientDisconnectReason.UnspecifiedError, null, null, null));
        }
    }

    public async Task<MqttClientConnectResult> ConnectAsync(MqttClientOptions options, CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _connectAttempts);
        Options = options;
        if (WhileConnecting is { } whileConnecting)
        {
            await whileConnecting(cancellationToken);
        }

        var result = OnConnect();
        if (result.ResultCode == MqttClientConnectResultCode.Success)
        {
            _isConnected = true;
            if (ConnectedAsync is { } handlers)
            {
                await handlers(new MqttClientConnectedEventArgs(result));
            }
        }

        return result;
    }

    public Task DisconnectAsync(MqttClientDisconnectOptions options, CancellationToken cancellationToken = default)
    {
        Disconnects++;
        _isConnected = false;
        return Task.CompletedTask;
    }

    public Task PingAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<MqttClientPublishResult> PublishAsync(MqttApplicationMessage applicationMessage, CancellationToken cancellationToken = default)
    {
        OnPublish?.Invoke(applicationMessage);
        Published.Enqueue(applicationMessage);
        return Task.FromResult(new MqttClientPublishResult(null, MqttClientPublishReasonCode.Success, string.Empty, []));
    }

    public Task SendEnhancedAuthenticationExchangeDataAsync(MqttEnhancedAuthenticationExchangeData data, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public async Task<MqttClientSubscribeResult> SubscribeAsync(MqttClientSubscribeOptions options, CancellationToken cancellationToken = default)
    {
        Subscribes.Enqueue(options);
        if (WhileSubscribing is { } whileSubscribing)
        {
            await whileSubscribing(cancellationToken);
        }

        var items = options.TopicFilters
            .Select(filter => new MqttClientSubscribeResultItem(filter, MqttClientSubscribeResultCode.GrantedQoS0))
            .ToList();
        return new MqttClientSubscribeResult(1, items, string.Empty, []);
    }

    public Task<MqttClientUnsubscribeResult> UnsubscribeAsync(MqttClientUnsubscribeOptions options, CancellationToken cancellationToken = default)
    {
        Unsubscribes.Enqueue(options);
        var items = options.TopicFilters
            .Select(filter => new MqttClientUnsubscribeResultItem(filter, MqttClientUnsubscribeResultCode.Success))
            .ToList();
        return Task.FromResult(new MqttClientUnsubscribeResult(2, items, string.Empty, []));
    }

    public void Dispose()
    {
        IsDisposed = true;
        _isConnected = false;

        // Events of the interface that this fake never raises.
        _ = ApplicationMessageReceivedAsync;
        _ = ConnectingAsync;
        _ = InspectPacketAsync;
    }
}
