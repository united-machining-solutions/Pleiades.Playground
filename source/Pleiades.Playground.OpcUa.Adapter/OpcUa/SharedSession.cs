using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>A session to an OPC UA server, as the machines that share it see it.</summary>
internal interface IEndpointSession : IAsyncDisposable
{
    /// <summary>The session of the OPC UA stack.</summary>
    ISession Session { get; }

    /// <summary>Whether the server still answers.</summary>
    bool IsAlive { get; }

    /// <summary>Closes the session. Never throws.</summary>
    Task CloseAsync();
}

/// <summary>Opens a session on the endpoint a registration names.</summary>
internal interface ISessionConnector
{
    /// <summary>Opens a session. The server must present the certificate the endpoint names, if it names one.</summary>
    Task<IEndpointSession> ConnectAsync(EndpointRegistration endpoint, CancellationToken cancellationToken);
}

/// <summary>
/// A machine on a shared session. The session calls it when it comes and goes; the machine keeps
/// its own subscription on it and says itself whether it is connected.
/// </summary>
internal interface ISessionTenant
{
    /// <summary>The serial number of the machine, for the log.</summary>
    string Name { get; }

    /// <summary>The endpoint of its registration.</summary>
    EndpointRegistration Endpoint { get; }

    /// <summary>A session is being opened.</summary>
    void SessionConnecting();

    /// <summary>Subscribes on the session and says <c>Connected</c>. Throws if the machine cannot be run on it.</summary>
    Task AttachAsync(IEndpointSession session, CancellationToken cancellationToken);

    /// <summary>Deletes its subscription and says <c>Disconnected</c>: the machine leaves a session that goes on.</summary>
    Task DetachAsync(IEndpointSession session);

    /// <summary>The session failed or is gone. The machine says <c>Disconnected</c> if it was connected.</summary>
    Task SessionDownAsync(string? reason);
}

/// <summary>
/// One session to one endpoint, shared by every machine registered on it. It connects, watches the
/// session and connects again when it is lost, and attaches each machine to it. A machine whose
/// subscription fails is tried again later; the session and the other machines go on.
/// </summary>
internal sealed class SharedSession : IAsyncDisposable
{
    private static readonly TimeSpan Watch = TimeSpan.FromSeconds(2);
    private const int SilentTicks = 3;
    private const int RetryTicks = 15;

    private readonly ISessionConnector _connector;
    private readonly ILogger _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly List<ISessionTenant> _tenants = [];
    private readonly HashSet<ISessionTenant> _attached = [];
    private readonly CancellationTokenSource _cancellation;
    private readonly TimeSpan _firstDelay;
    private IEndpointSession? _current;
    private Task? _loop;

    /// <summary>Creates the session. Nothing happens before the first tenant is added.</summary>
    public SharedSession(
        EndpointKey key,
        EndpointRegistration endpoint,
        ISessionConnector connector,
        ILogger logger,
        CancellationToken stopping,
        TimeSpan? firstDelay = null)
    {
        Key = key;
        Endpoint = endpoint ?? throw new ArgumentNullException(nameof(endpoint));
        _connector = connector ?? throw new ArgumentNullException(nameof(connector));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _cancellation = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        _firstDelay = firstDelay ?? TimeSpan.FromSeconds(2);
    }

    /// <summary>What makes this session the one of its machines.</summary>
    public EndpointKey Key { get; }

    /// <summary>The endpoint it connects to.</summary>
    public EndpointRegistration Endpoint { get; }

    /// <summary>Whether a session stands now.</summary>
    public bool IsOpen => _current is not null;

    /// <summary>How many machines share it.</summary>
    public int Count
    {
        get
        {
            lock (_tenants)
            {
                return _tenants.Count;
            }
        }
    }

    /// <summary>The serial numbers of the machines that share it.</summary>
    public IReadOnlyList<string> Names
    {
        get
        {
            lock (_tenants)
            {
                return [.. _tenants.Select(tenant => tenant.Name)];
            }
        }
    }

    /// <summary>Adds a machine. If the session stands, the machine is attached at once.</summary>
    public async Task AddAsync(ISessionTenant tenant)
    {
        ArgumentNullException.ThrowIfNull(tenant);
        await _gate.WaitAsync(_cancellation.Token).ConfigureAwait(false);
        try
        {
            lock (_tenants)
            {
                _tenants.Add(tenant);
            }

            if (_current is { } session)
            {
                await AttachAsync(tenant, session).ConfigureAwait(false);
            }
            else
            {
                tenant.SessionConnecting();
            }

            _loop ??= Task.Run(() => RunAsync(_cancellation.Token), CancellationToken.None);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Takes a machine off the session: its subscription is deleted and it says <c>Disconnected</c>.
    /// Returns true if it was the last one; the caller then closes the session with <see cref="DisposeAsync"/>.
    /// </summary>
    public async Task<bool> RemoveAsync(ISessionTenant tenant)
    {
        ArgumentNullException.ThrowIfNull(tenant);
        await _gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            bool last;
            lock (_tenants)
            {
                _tenants.Remove(tenant);
                last = _tenants.Count == 0;
            }

            if (_attached.Remove(tenant) && _current is { } session)
            {
                await tenant.DetachAsync(session).ConfigureAwait(false);
            }
            else
            {
                await tenant.SessionDownAsync(null).ConfigureAwait(false);
            }

            return last;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Stops connecting and closes the session.</summary>
    public async ValueTask DisposeAsync()
    {
        await _cancellation.CancelAsync().ConfigureAwait(false);
        if (_loop is { } loop)
        {
            await loop.ConfigureAwait(false);
        }

        _cancellation.Dispose();
        _gate.Dispose();
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var delay = _firstDelay;
        while (!cancellationToken.IsCancellationRequested)
        {
            string? reason = null;
            try
            {
                foreach (var tenant in Tenants())
                {
                    tenant.SessionConnecting();
                }

                var session = await _connector.ConnectAsync(Endpoint, cancellationToken).ConfigureAwait(false);
                try
                {
                    await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    // Stopped between the connect and the gate: the session is not ours yet, so nothing else closes it.
                    await session.CloseAsync().ConfigureAwait(false);
                    await session.DisposeAsync().ConfigureAwait(false);
                    throw;
                }

                try
                {
                    _current = session;
                    await Task.WhenAll(Tenants().Select(tenant => AttachAsync(tenant, session))).ConfigureAwait(false);
                }
                finally
                {
                    _gate.Release();
                }

                _logger.EndpointSessionOpened(Endpoint.Url, Count);
                delay = _firstDelay;
                await WatchAsync(session, cancellationToken).ConfigureAwait(false);
                reason = "The session was lost.";
                _logger.EndpointSessionLost(Endpoint.Url);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Stopped on purpose: the last machine left, or the service stops.
            }
#pragma warning disable CA1031 // Whatever a server or the network throws: the session waits and tries again.
            catch (Exception exception)
#pragma warning restore CA1031
            {
                reason = exception.Message;
                _logger.EndpointConnectFailed(Endpoint.Url, exception.Message, delay.TotalSeconds);
            }
            finally
            {
                await DownAsync(reason).ConfigureAwait(false);
            }

            try
            {
                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            delay = TimeSpan.FromSeconds(Math.Min(60, delay.TotalSeconds * 2));
        }
    }

    /// <summary>
    /// Returns when the session has been without a sign of life for a few seconds. Meanwhile a
    /// machine that could not be attached is tried again now and then.
    /// </summary>
    private async Task WatchAsync(IEndpointSession session, CancellationToken cancellationToken)
    {
        var silent = 0;
        var ticks = 0;
        while (silent < SilentTicks)
        {
            await Task.Delay(Watch, cancellationToken).ConfigureAwait(false);
            silent = session.IsAlive ? 0 : silent + 1;
            if (silent == 0 && ++ticks % RetryTicks == 0)
            {
                await RetryAsync(session, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private async Task RetryAsync(IEndpointSession session, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var waiting = Tenants().Where(tenant => !_attached.Contains(tenant)).ToList();
            await Task.WhenAll(waiting.Select(tenant => AttachAsync(tenant, session))).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Every machine says the session is gone, and the session is closed.</summary>
    private async Task DownAsync(string? reason)
    {
        await _gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            var session = _current;
            _current = null;
            _attached.Clear();
            foreach (var tenant in Tenants())
            {
                await tenant.SessionDownAsync(reason).ConfigureAwait(false);
            }

            if (session is not null)
            {
                await session.CloseAsync().ConfigureAwait(false);
                await session.DisposeAsync().ConfigureAwait(false);
                _logger.EndpointSessionClosed(Endpoint.Url);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task AttachAsync(ISessionTenant tenant, IEndpointSession session)
    {
        try
        {
            await tenant.AttachAsync(session, _cancellation.Token).ConfigureAwait(false);
            lock (_attached)
            {
                _attached.Add(tenant);
            }
        }
        catch (OperationCanceledException) when (_cancellation.IsCancellationRequested)
        {
            throw;
        }
#pragma warning disable CA1031 // One machine that cannot be run on the session must not take the others down.
        catch (Exception exception)
#pragma warning restore CA1031
        {
            _logger.MachineAttachFailed(tenant.Name, Endpoint.Url, exception.Message);
        }
    }

    private List<ISessionTenant> Tenants()
    {
        lock (_tenants)
        {
            return [.. _tenants];
        }
    }
}

/// <summary>
/// The sessions of the adapter, one per endpoint. A machine takes the session of its endpoint, and
/// the session is opened with the first machine and closed with the last one.
/// </summary>
internal sealed class SessionPool : IAsyncDisposable
{
    private readonly Dictionary<EndpointKey, SharedSession> _sessions = [];

    // One gate per endpoint: adding or removing a machine waits only for the other machines of its endpoint, and
    // a slow gateway does not hold up a registration on another server.
    private readonly Dictionary<EndpointKey, SemaphoreSlim> _gates = [];
    private readonly ISessionConnector _connector;
    private readonly ILogger _logger;
    private readonly TimeSpan? _firstDelay;

    /// <summary>Creates the pool.</summary>
    public SessionPool(ISessionConnector connector, ILogger logger, TimeSpan? firstDelay = null)
    {
        _connector = connector ?? throw new ArgumentNullException(nameof(connector));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _firstDelay = firstDelay;
    }

    /// <summary>The session a machine on this endpoint shares, or null if no machine is on it.</summary>
    public SharedSession? Find(EndpointRegistration endpoint)
    {
        lock (_sessions)
        {
            return _sessions.GetValueOrDefault(EndpointKey.Of(endpoint));
        }
    }

    /// <summary>How many sessions are held.</summary>
    public int Count
    {
        get
        {
            lock (_sessions)
            {
                return _sessions.Count;
            }
        }
    }

    /// <summary>Puts a machine on the session of its endpoint, and opens that session if it is the first.</summary>
    public async Task AddAsync(ISessionTenant tenant, CancellationToken stopping)
    {
        ArgumentNullException.ThrowIfNull(tenant);
        var key = EndpointKey.Of(tenant.Endpoint);
        var gate = GateOf(key);
        await gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            SharedSession? session;
            lock (_sessions)
            {
                if (!_sessions.TryGetValue(key, out session))
                {
                    session = new SharedSession(key, tenant.Endpoint, _connector, _logger, stopping, _firstDelay);
                    _sessions[key] = session;
                }
            }

            await session.AddAsync(tenant).ConfigureAwait(false);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Takes a machine off its session, and closes the session if it was the last machine on it.</summary>
    public async Task RemoveAsync(ISessionTenant tenant)
    {
        ArgumentNullException.ThrowIfNull(tenant);
        var key = EndpointKey.Of(tenant.Endpoint);
        var gate = GateOf(key);
        await gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            SharedSession? session;
            lock (_sessions)
            {
                session = _sessions.GetValueOrDefault(key);
            }

            if (session is null || !await session.RemoveAsync(tenant).ConfigureAwait(false))
            {
                return;
            }

            lock (_sessions)
            {
                _sessions.Remove(key);
            }

            await session.DisposeAsync().ConfigureAwait(false);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Closes every session.</summary>
    public async ValueTask DisposeAsync()
    {
        List<SharedSession> sessions;
        lock (_sessions)
        {
            sessions = [.. _sessions.Values];
            _sessions.Clear();
        }

        foreach (var session in sessions)
        {
            await session.DisposeAsync().ConfigureAwait(false);
        }

        lock (_sessions)
        {
            foreach (var gate in _gates.Values)
            {
                gate.Dispose();
            }

            _gates.Clear();
        }
    }

    /// <summary>The gate of an endpoint. It is kept: there are as many as endpoints were ever used.</summary>
    private SemaphoreSlim GateOf(EndpointKey key)
    {
        lock (_sessions)
        {
            if (!_gates.TryGetValue(key, out var gate))
            {
                gate = new SemaphoreSlim(1, 1);
                _gates[key] = gate;
            }

            return gate;
        }
    }
}
