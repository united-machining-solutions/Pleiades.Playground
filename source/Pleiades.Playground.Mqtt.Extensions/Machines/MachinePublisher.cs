// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions.Machines;

/// <summary>
/// Puts what an adapter of a real device knows on the broker as the binding says: every value retained with QoS 1
/// in the envelope of the model, the manifest before the values, and <c>Connection/State</c> as the state of the
/// adapter.
/// <list type="bullet">
/// <item>At the first connect: <c>Initializing</c>, the manifest, the identification and every value known, and
/// then <c>Running</c> once the device has answered, or <c>CommunicationFault</c> once it has not.</item>
/// <item>At every later connect: the manifest and every value again, then the state, without a second
/// <c>Initializing</c>.</item>
/// <item>Nothing else goes out on a connection before that sequence, not even the heartbeat. When the sequence
/// fails, the next call of <see cref="ReachedAsync"/>, <see cref="LostAsync"/> or <see cref="HeartbeatAsync"/> tries
/// it again.</item>
/// <item>While the device answers (<see cref="ReachedAsync"/>), a value goes out when it changes; one the device no
/// longer reports goes out once as <c>null</c>, not available right now.</item>
/// <item>When it stops answering (<see cref="LostAsync"/>): <c>CommunicationFault</c>; the values stand, only the
/// heartbeat goes on. When it answers again: every value anew, then <c>Running</c>.</item>
/// <item>At a clean stop (<see cref="ShutdownAsync"/>): <c>Shutdown</c>, the last message.</item>
/// </list>
/// The last will (<see cref="MachineBinding.WithMachineLastWill"/>) belongs to the options of the client. Events
/// are not published here.
/// </summary>
public sealed partial class MachinePublisher : IDisposable
{
    private readonly IManagedMqttClient _client;
    private readonly TimeProvider _time;
    private readonly ILogger _logger;
    private readonly DateTimeOffset _start;
    private readonly IReadOnlyList<MachineValue> _identification;

    // Neither is disposed: a handler of the client in flight may still wait on the gate when the publisher is
    // disposed. It ends quietly through the cancellation instead. Without a wait handle they hold nothing unmanaged.
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CancellationTokenSource _disposing = new();

    private readonly Dictionary<string, string> _sent = new(StringComparer.Ordinal);
    private JsonObject _manifest;
    private Dictionary<string, MachineValue> _current = new(StringComparer.Ordinal);
    private bool? _reachable;
    private bool _saidInitializing;
    private volatile bool _synced;
    private volatile bool _syncFailed;
    private volatile bool _disposed;
    private bool _attached;
    private DateTimeOffset _lastStateAt = DateTimeOffset.MinValue;
    private long _heartbeats;

    /// <param name="client">The MQTT connection of the adapter, with the last will of the binding.</param>
    /// <param name="identity">Who the machine is; its values go out at every connect.</param>
    /// <param name="manifest">The manifest (<see cref="MachineManifest.Build"/>).</param>
    /// <param name="time">The clock.</param>
    /// <param name="logger">The logger.</param>
    public MachinePublisher(IManagedMqttClient client, MachineIdentity identity, JsonObject manifest, TimeProvider time, ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(time);
        ArgumentNullException.ThrowIfNull(logger);
        _client = client;
        _time = time;
        _logger = logger;
        _manifest = manifest;
        _start = time.GetUtcNow();
        MachineId = identity.MachineId;
        _identification = identity.Values(_start);
    }

    /// <summary>The machine id, a level of every topic.</summary>
    public string MachineId { get; }

    /// <summary>
    /// What the adapter says the device is: <see langword="true"/> reached, <see langword="false"/> not reached,
    /// <see langword="null"/> not asked yet.
    /// </summary>
    public bool? Reachable => _reachable;

    /// <summary>
    /// Hears every connect and disconnect of the client from now on; when it is connected already, publishes the
    /// state at once.
    /// </summary>
    public async Task AttachAsync()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!_attached)
        {
            _client.ConnectedAsync += OnConnectedAsync;
            _client.DisconnectedAsync += OnDisconnectedAsync;
            _attached = true;
        }
        if (_client.IsConnected)
        {
            await ConnectedAsync(_time.GetUtcNow()).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// After a connect: <c>Initializing</c> the first time, the manifest, the identification, the elements the
    /// machine lacks as <c>null</c>, every value known, and then the state of the device if it is known. A failure
    /// is logged; the next call that would publish tries the sequence again.
    /// </summary>
    public async Task ConnectedAsync(DateTimeOffset now)
    {
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            _synced = false;
            await SyncAsync(now).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// The device answered with <paramref name="values"/>, the whole of what it says now. A value that changed goes
    /// out; one it said before and no longer says goes out once as <c>null</c>. When the device had not answered
    /// before, every value goes out and then <c>Running</c>.
    /// </summary>
    public async Task ReachedAsync(IEnumerable<MachineValue> values, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(values);
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            var next = new Dictionary<string, MachineValue>(StringComparer.Ordinal);
            foreach (var value in values)
            {
                next[value.Path] = value;
            }
            foreach (var (path, old) in _current)
            {
                if (!next.ContainsKey(path))
                {
                    next[path] = old.Value is null ? old : new MachineValue(path, null, now);
                }
            }
            var wasReached = _reachable == true;
            _current = next;
            _reachable = true;
            if (!await ReadyAsync(now).ConfigureAwait(false))
            {
                // The connect sequence publishes everything, Running included.
                return;
            }
            if (!wasReached)
            {
                await SendAllAsync().ConfigureAwait(false);
                await SendStateAsync(MachineBinding.Running, now).ConfigureAwait(false);
                LogReached(MachineId);
                return;
            }
            foreach (var value in _current.Values)
            {
                var signature = Signature(value);
                if (!_sent.TryGetValue(value.Path, out var sent) || sent != signature)
                {
                    await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, value)).ConfigureAwait(false);
                    _sent[value.Path] = signature;
                }
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// The device does not answer: <c>CommunicationFault</c>, once. The values stand with their time; only the
    /// heartbeat goes on.
    /// </summary>
    public async Task LostAsync(DateTimeOffset now)
    {
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            var changed = _reachable != false;
            _reachable = false;
            if (changed)
            {
                LogLost(MachineId);
            }
            if (!await ReadyAsync(now).ConfigureAwait(false))
            {
                // The connect sequence publishes the state.
                return;
            }
            if (changed)
            {
                await SendStateAsync(MachineBinding.CommunicationFault, now).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// The sign of life of the adapter: <c>Connection/Heartbeat</c>, a count from 1, once the connect sequence of the
    /// connection has gone out.
    /// </summary>
    public async Task HeartbeatAsync(DateTimeOffset now)
    {
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            if (await ReadyAsync(now).ConfigureAwait(false))
            {
                var heartbeat = new MachineValue(MachineBinding.Heartbeat, JsonValue.Create(++_heartbeats), now);
                await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, heartbeat)).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// A new manifest, for example when the device reports an instance it did not report before. It goes out at
    /// once, before the values that follow, when it differs from the last one.
    /// </summary>
    public async Task UpdateManifestAsync(JsonObject manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            if (JsonNode.DeepEquals(manifest, _manifest))
            {
                return;
            }
            _manifest = manifest;
            if (_client.IsConnected && _synced)
            {
                await _client.EnqueueAsync(MachineBinding.ManifestMessage(MachineId, _manifest)).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// A clean stop: <c>Shutdown</c>, the last message, and a wait of at most <paramref name="drain"/> until the
    /// client has sent what it holds.
    /// </summary>
    public async Task ShutdownAsync(DateTimeOffset now, TimeSpan drain)
    {
        if (!await EnterAsync().ConfigureAwait(false))
        {
            return;
        }
        try
        {
            if (!_client.IsConnected)
            {
                return;
            }
            await SendStateAsync(MachineBinding.Shutdown, now).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
        var deadline = _time.GetUtcNow() + drain;
        while (_client.IsConnected && _client.PendingApplicationMessagesCount > 0 && _time.GetUtcNow() < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), _time).ConfigureAwait(false);
        }
    }

    /// <inheritdoc />
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Usage", "CA2213:Disposable fields should be disposed",
        Justification = "A handler of the client in flight may still wait on the gate; it ends through the cancellation.")]
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }
        _disposed = true;
        if (_attached)
        {
            _client.ConnectedAsync -= OnConnectedAsync;
            _client.DisconnectedAsync -= OnDisconnectedAsync;
            _attached = false;
        }
        _disposing.Cancel();
    }

    /// <summary>Takes the gate, or says no once the publisher is disposed: then nothing goes out.</summary>
    private async Task<bool> EnterAsync()
    {
        if (_disposed)
        {
            return false;
        }
        try
        {
            await _gate.WaitAsync(_disposing.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        if (_disposed)
        {
            _gate.Release();
            return false;
        }
        return true;
    }

    /// <summary>
    /// Whether the connection may carry more than the connect sequence: connected, and the sequence has gone out.
    /// After a failed sequence it is tried again here. Before the handler of a connect has run, nothing goes out.
    /// </summary>
    private async Task<bool> ReadyAsync(DateTimeOffset now)
    {
        if (!_client.IsConnected)
        {
            return false;
        }
        if (!_synced && _syncFailed)
        {
            await SyncAsync(now).ConfigureAwait(false);
            // Everything the caller would send is in the sequence.
            return false;
        }
        return _synced;
    }

    /// <summary>The connect sequence. Holds the gate.</summary>
    private async Task SyncAsync(DateTimeOffset now)
    {
        try
        {
            if (!_saidInitializing)
            {
                await SendStateAsync(MachineBinding.Initializing, now).ConfigureAwait(false);
                _saidInitializing = true;
            }
            await _client.EnqueueAsync(MachineBinding.ManifestMessage(MachineId, _manifest)).ConfigureAwait(false);
            foreach (var value in _identification)
            {
                await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, value)).ConfigureAwait(false);
            }
            foreach (var path in MachineManifest.Unavailable(_manifest))
            {
                await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, new MachineValue(path, null, _start))).ConfigureAwait(false);
            }
            await SendAllAsync().ConfigureAwait(false);
            if (_reachable is { } reachable)
            {
                await SendStateAsync(reachable ? MachineBinding.Running : MachineBinding.CommunicationFault, now).ConfigureAwait(false);
            }
            _synced = true;
            _syncFailed = false;
            LogConnected(MachineId, _current.Count);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _syncFailed = true;
            LogSyncFailed(MachineId, exception);
        }
    }

    private Task OnConnectedAsync(MqttClientConnectedEventArgs args)
    {
        return ConnectedAsync(_time.GetUtcNow());
    }

    private Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs args)
    {
        // The next connection begins with its connect sequence; until then nothing else goes out.
        _synced = false;
        _syncFailed = false;
        return Task.CompletedTask;
    }

    private async Task SendAllAsync()
    {
        foreach (var value in _current.Values)
        {
            await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, value)).ConfigureAwait(false);
            _sent[value.Path] = Signature(value);
        }
    }

    /// <summary>
    /// <c>Connection/State</c>, a millisecond after the state before it at the latest, the precision of a
    /// timestamp of the model: with the same instant a store that reads the newest value could not tell which of
    /// two states came last.
    /// </summary>
    private async Task SendStateAsync(string state, DateTimeOffset now)
    {
        var at = new DateTimeOffset(now.UtcTicks - (now.UtcTicks % TimeSpan.TicksPerMillisecond), TimeSpan.Zero);
        if (at <= _lastStateAt)
        {
            at = _lastStateAt.AddMilliseconds(1);
        }
        var value = new MachineValue(MachineBinding.ConnectionState, JsonValue.Create(state), at);
        await _client.EnqueueAsync(MachineBinding.ValueMessage(MachineId, value)).ConfigureAwait(false);
        _lastStateAt = at;
    }

    /// <summary>What a value says, without its time: a value that says the same again does not go out.</summary>
    private static string Signature(MachineValue value)
    {
        var envelope = MachineBinding.Envelope(value);
        envelope.Remove("timestamp");
        return envelope.ToJsonString();
    }

    [LoggerMessage(EventId = 200, Level = LogLevel.Information,
        Message = "Published the manifest and {Count} values of {MachineId} after a connect")]
    private partial void LogConnected(string machineId, int count);

    [LoggerMessage(EventId = 201, Level = LogLevel.Information, Message = "{MachineId} answers: Running")]
    private partial void LogReached(string machineId);

    [LoggerMessage(EventId = 202, Level = LogLevel.Warning, Message = "{MachineId} does not answer: CommunicationFault")]
    private partial void LogLost(string machineId);

    [LoggerMessage(EventId = 203, Level = LogLevel.Warning,
        Message = "The connect sequence of {MachineId} failed; it is tried again with the next value, state or heartbeat")]
    private partial void LogSyncFailed(string machineId, Exception exception);
}
