using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Pleiades.Playground.OpcUa.Adapter.Api;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter;

/// <summary>What became of a request to register a machine.</summary>
/// <param name="Registration">The registration as it is stored, if it was.</param>
/// <param name="Problems">Why it was not stored. Empty if it was.</param>
/// <param name="Endpoints">The endpoints of the server, strongest first, if the security was the problem.</param>
/// <param name="Probe">What every node gave, if the server was reached.</param>
internal sealed record RegistrationOutcome(
    MachineRegistration? Registration,
    IReadOnlyList<string> Problems,
    IReadOnlyList<RankedEndpoint>? Endpoints,
    ProbeResult? Probe)
{
    /// <summary>
    /// The registration as it was checked, with the known mappings and the profiles applied, also
    /// when it was refused. Null if it was refused before that.
    /// </summary>
    public MachineRegistration? Tried { get; init; }

    /// <summary>Whether the machine is registered now.</summary>
    public bool Registered => Registration is not null && Problems.Count == 0;
}

/// <summary>The endpoints a server offers, and the user a person stored for it.</summary>
/// <param name="Url">The address that was asked.</param>
/// <param name="Offered">Every endpoint of the server.</param>
/// <param name="User">The user a person stored for this server, or null.</param>
internal sealed record EndpointOffer(string Url, IReadOnlyList<OfferedEndpoint> Offered, string? User)
{
    /// <summary>The endpoints a session can use, strongest first: with the stored user if there is one, else without a user.</summary>
    public IReadOnlyList<RankedEndpoint> Ranked => EndpointRanking.Rank(Offered, withUser: User is not null);

    /// <summary>True if the server accepts no session without a user.</summary>
    public bool NeedsUser => Offered.Count > 0 && !Offered.Any(endpoint => endpoint.Anonymous);

    /// <summary>True if the server accepts a user name and a password on an encrypted endpoint.</summary>
    public bool AcceptsUser => Offered.Any(endpoint => endpoint.UserName && endpoint.SecurityMode == SecurityMode.SignAndEncrypt);
}

/// <summary>What an OPC UA server serves: its endpoints and its machines.</summary>
/// <param name="Url">The address that was asked.</param>
/// <param name="Endpoints">The endpoints of the server, strongest first. The machines were read on the first one.</param>
/// <param name="Machines">The machines found below Objects.</param>
internal sealed record ServedMachines(string Url, IReadOnlyList<RankedEndpoint> Endpoints, IReadOnlyList<FoundMachine> Machines);

/// <summary>
/// Keeps every registered machine running. At start it reads the stored registrations and connects
/// each: no discovery, no language model, nothing but the files. A machine is added and removed at
/// run time, without a restart of the service.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated by DI")]
internal sealed class MachineSupervisor : BackgroundService
{
    private readonly ConcurrentDictionary<string, Running> _machines = new(StringComparer.Ordinal);
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Usage", "CA2213:Disposable fields should be disposed",
        Justification = "Disposed asynchronously at the end of ExecuteAsync, after every machine left it.")]
    private readonly SessionPool _pool;
    private readonly MachineDataEraser _eraser;
    private readonly SemaphoreSlim _changes = new(1, 1);
    private readonly RegistrationStore _store;
    private readonly AlertStore _alertStore;
    private readonly OpcUaClient _client;
    private readonly RegistrationProbe _probe;
    private readonly IMachinePublisher _publisher;
    private readonly DraftStore _drafts;
    private readonly CredentialStore _credentials;
    private readonly Config _config;
    private readonly ILogger<MachineSupervisor> _logger;
    private CancellationToken _stopping;

    public MachineSupervisor(
        RegistrationStore store,
        AlertStore alertStore,
        OpcUaClient client,
        RegistrationProbe probe,
        IMachinePublisher publisher,
        DraftStore drafts,
        CredentialStore credentials,
        MachineDataEraser eraser,
        IOptions<Config> config,
        ILogger<MachineSupervisor> logger)
    {
        _credentials = credentials;
        _eraser = eraser;
        _store = store;
        _alertStore = alertStore;
        _client = client;
        _probe = probe;
        _publisher = publisher;
        _drafts = drafts;
        _config = config.Value;
        _logger = logger;
        _pool = new SessionPool(client, logger);
    }

    /// <summary>The machines that are registered, by serial number.</summary>
    public IReadOnlyList<MachineConnection> Machines =>
        [.. _machines.Values.Select(running => running.Connection).OrderBy(connection => connection.Registration.SerialNumber, StringComparer.Ordinal)];

    /// <summary>The connection of one machine, or null if it is not registered.</summary>
    public MachineConnection? Find(string serialNumber) =>
        _machines.TryGetValue(serialNumber, out var running) ? running.Connection : null;

    /// <summary>The serial numbers of the machines that share the session of this machine, itself included.</summary>
    public IReadOnlyList<string> SharingSession(MachineConnection connection) =>
        _pool.Find(connection.Registration.Endpoint)?.Names.Order(StringComparer.Ordinal).ToList() ?? [connection.Registration.SerialNumber];

    /// <summary>
    /// The machines a server serves, read on its strongest endpoint: one for the server of a machine,
    /// several for an aggregation server. Nothing is stored.
    /// </summary>
    public async Task<ServedMachines> FindMachinesAsync(string url, CancellationToken cancellationToken)
    {
        url = EndpointKey.Trim(url);
        var offer = await OfferAsync(url, cancellationToken).ConfigureAwait(false);
        var endpoints = offer.Ranked;
        if (endpoints.Count == 0)
        {
            if (offer.NeedsUser && offer.User is null)
            {
                throw new CredentialMissingException(WantsUser(url, offer));
            }

            return new ServedMachines(url, endpoints, []);
        }

        var best = endpoints[0].Endpoint;
        var endpoint = new EndpointRegistration
        {
            Url = url,
            SecurityMode = best.SecurityMode,
            SecurityPolicy = best.SecurityPolicy,
            User = offer.User,
        };
        var (session, _) = await _client.ConnectAsync(endpoint, cancellationToken).ConfigureAwait(false);
        var shared = new ManagedEndpointSession(session);
        await using (shared.ConfigureAwait(false))
        {
            try
            {
                var machines = await MachineFinder.FindAsync(new UaAddressSpace(session), cancellationToken).ConfigureAwait(false);
                return new ServedMachines(url, endpoints, machines);
            }
            finally
            {
                await shared.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    /// <summary>The endpoints of a server, and the user a person stored for it.</summary>
    public async Task<EndpointOffer> OfferAsync(string url, CancellationToken cancellationToken)
    {
        url = EndpointKey.Trim(url);
        var offered = await _client.GetEndpointsAsync(url, cancellationToken).ConfigureAwait(false);
        return new EndpointOffer(url, offered, _credentials.Find(url)?.User);
    }

    /// <summary>The endpoints of a server a session can use, strongest first.</summary>
    public async Task<IReadOnlyList<RankedEndpoint>> RankEndpointsAsync(string url, CancellationToken cancellationToken) =>
        (await OfferAsync(url, cancellationToken).ConfigureAwait(false)).Ranked;

    /// <summary>
    /// Stores the user and password a person entered for a server, after the server accepted them in
    /// a session of its strongest encrypted endpoint. Returns why not, or null if they are stored.
    /// </summary>
    public async Task<string?> SaveUserAsync(string url, Credential credential, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(credential);
        url = EndpointKey.Trim(url);
        var offer = await OfferAsync(url, cancellationToken).ConfigureAwait(false);
        var ranked = EndpointRanking.Rank(offer.Offered, withUser: true);
        if (ranked.Count == 0)
        {
            return $"The server at {url} accepts no user name and password on an encrypted endpoint.";
        }

        // Tried before it is kept: a wrong password is told the person now, not by a machine that does not connect.
        using var trial = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        trial.CancelAfter(UserTrialTimeout);
        try
        {
            var best = ranked[0].Endpoint;
            var endpoint = new EndpointRegistration { Url = url, SecurityMode = best.SecurityMode, SecurityPolicy = best.SecurityPolicy, User = credential.User };
            var (session, _) = await _client.ConnectAsync(endpoint, trial.Token, credential).ConfigureAwait(false);
            var tried = new ManagedEndpointSession(session);
            await using (tried.ConfigureAwait(false))
            {
                await tried.CloseAsync().ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return $"The server at {url} did not accept the user {credential.User} within {UserTrialTimeout.TotalSeconds:0} seconds.";
        }
        catch (Exception exception) when (MachineEndpointsFault(exception))
        {
            return $"The server at {url} did not accept the user {credential.User}: {exception.Message}";
        }

        _credentials.Save(url, credential);
        _logger.UserStored(url, credential.User);
        return null;
    }

    private static readonly TimeSpan UserTrialTimeout = TimeSpan.FromSeconds(30);

    /// <summary>Forgets the user of a server. Machines registered with it do not connect any more.</summary>
    public bool RemoveUser(string url)
    {
        var removed = _credentials.Remove(EndpointKey.Trim(url));
        if (removed)
        {
            _logger.UserRemoved(EndpointKey.Trim(url));
        }

        return removed;
    }

    /// <summary>The servers with a stored user, without the passwords.</summary>
    public IReadOnlyList<StoredUser> Users => _credentials.Users;

    private static string WantsUser(string url, EndpointOffer offer) =>
        offer.AcceptsUser
            ? $"The server at {url} accepts no session without a user. A person enters a user name and a password on the endpoints card of the chat (opcua_endpoint_rank); never in the chat itself."
            : $"The server at {url} accepts no session without a user, and no user name with a password on an encrypted endpoint.";

    private static bool MachineEndpointsFault(Exception exception) => Api.MachineEndpoints.IsServerFault(exception);

    /// <summary>
    /// Checks a registration against its server and, unless <paramref name="dryRun"/>, stores it and
    /// starts the machine. A machine that is registered already is replaced: this is how a scan
    /// that found new profiles is applied.
    /// </summary>
    public async Task<RegistrationOutcome> RegisterAsync(MachineRegistration registration, bool dryRun, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(registration);
        registration = registration with { Endpoint = registration.Endpoint with { Url = EndpointKey.Trim(registration.Endpoint.Url) } };

        // The user a person stored for the server is the user of the session; the password stays in the store.
        if (registration.Endpoint.User is null && _credentials.Find(registration.Endpoint.Url) is { } storedUser)
        {
            registration = registration with { Endpoint = registration.Endpoint with { User = storedUser.User } };
        }

        // What the adapter knows of a namespace is not left to the scan. A profile that is not
        // complete is not published, and the profiles are the ones that are complete.
        registration = DataModelProfiles.Apply(KnownMappings.Apply(registration), out _);
        var problems = RegistrationValidator.Validate(registration);
        if (problems.Count > 0)
        {
            return new RegistrationOutcome(null, problems, null, null) { Tried = registration };
        }

        // The strongest endpoint the server offers is taken, unless a person decided otherwise.
        var offer = await OfferAsync(registration.Endpoint.Url, cancellationToken).ConfigureAwait(false);
        var endpoints = EndpointRanking.Rank(offer.Offered, withUser: registration.Endpoint.User is not null);
        var chosen = endpoints.FirstOrDefault(ranked =>
            ranked.Endpoint.SecurityMode == registration.Endpoint.SecurityMode
            && ranked.Endpoint.SecurityPolicy == registration.Endpoint.SecurityPolicy);
        if (chosen is null)
        {
            var problem = registration.Endpoint.User is null && offer.NeedsUser
                ? $"endpoint: {WantsUser(registration.Endpoint.Url, offer)} Then propose again."
                : registration.Endpoint.User is null
                    ? "endpoint: the server offers no such endpoint for a session without a user."
                    : "endpoint: the server offers no such endpoint for a session with a user name.";
            return new RegistrationOutcome(null, [problem], endpoints, null) { Tried = registration };
        }

        if ((!chosen.Recommended || chosen.Weak) && !registration.Endpoint.AllowWeaker)
        {
            var best = endpoints[0].Endpoint;
            return new RegistrationOutcome(
                null,
                [$"endpoint: the server offers {best.SecurityMode} with {best.SecurityPolicy}, which is stronger. Take it, or set endpoint.allowWeaker if a person decided for the weaker one."],
                endpoints,
                null) { Tried = registration };
        }

        var probe = await _probe.ProbeAsync(registration, cancellationToken).ConfigureAwait(false);

        // An element a known namespace set and the server does not fill is missing, not wrong.
        registration = Umati2DataModel.WithoutAbsent(registration, probe.NotFound.Select(element => (element.Area, element.Path)), out var absent);
        if (absent.Count > 0)
        {
            probe = probe with { Elements = [.. probe.Elements.Where(element => !(element.Area == "umati" && absent.Contains(element.Path)))] };
        }

        // An element that left makes its profile incomplete; the core decides whether the machine is added.
        var before = registration.Elements;
        registration = DataModelProfiles.Apply(registration, out var checks);
        if (registration.Elements.Count != before.Count)
        {
            probe = probe with { Elements = [.. probe.Elements.Where(element => registration.Elements.Any(kept => kept.Area == element.Area && kept.Path == element.Path))] };
        }

        var refused = new List<string>();
        refused.AddRange(probe.NotFound.Select(element => $"elements[{element.Path}]: the server has no node {element.Node}."));
        if (DataModelProfiles.CoreProblem(checks) is { } core)
        {
            refused.Add(core);
        }

        if (refused.Count > 0)
        {
            return new RegistrationOutcome(null, refused, endpoints, probe) { Tried = registration };
        }

        // On a server of several machines the registration has to be the machine it says it is.
        var mismatch = MachineChecks.Problems(registration, probe.Machines, probe.SerialNumber);
        if (mismatch.Count > 0)
        {
            return new RegistrationOutcome(null, mismatch, endpoints, probe) { Tried = registration };
        }

        // The certificate the server presents now is the one this machine is known by from here on.
        var stored = registration with
        {
            Endpoint = registration.Endpoint with
            {
                ServerCertificateThumbprint = registration.Endpoint.ServerCertificateThumbprint ?? probe.ServerCertificateThumbprint,
            },
            Discovery = (registration.Discovery ?? new DiscoveryRecord()) with { Namespaces = probe.Namespaces },
        };
        if (dryRun)
        {
            return new RegistrationOutcome(stored, [], endpoints, probe);
        }

        await _changes.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await StopAsync(stored.SerialNumber).ConfigureAwait(false);
            _store.Save(stored);
            await StartAsync(stored).ConfigureAwait(false);
        }
        finally
        {
            _changes.Release();
        }

        _logger.MachineRegistered(stored.SerialNumber, stored.Elements.Count, string.Join(", ", stored.Profiles));
        return new RegistrationOutcome(stored, [], endpoints, probe);
    }

    /// <summary>
    /// Tries a registration against its server and keeps it as a proposal. Nothing is stored and
    /// nothing is published: the machine is added when a person commits the proposal.
    /// </summary>
    public async Task<ProposalView> ProposeAsync(MachineRegistration registration, CancellationToken cancellationToken)
    {
        var outcome = await RegisterAsync(registration, dryRun: true, cancellationToken).ConfigureAwait(false);
        var stored = Find(registration.SerialNumber)?.Registration;
        var tried = outcome.Registration ?? outcome.Tried ?? DataModelProfiles.Apply(KnownMappings.Apply(registration), out _);
        var rows = outcome.Probe is null ? [] : Views.Rows(tried, outcome.Probe);
        var endpoint = Views.Endpoint(tried.Endpoint) with
        {
            CertificateThumbprint = tried.Endpoint.ServerCertificateThumbprint ?? outcome.Probe?.ServerCertificateThumbprint,
        };
        var draft = outcome.Registered ? _drafts.Add(tried) : null;
        return new ProposalView(
            outcome.Registered,
            draft?.Id,
            draft?.ExpiresAt,
            registration.SerialNumber,
            registration.DisplayName,
            endpoint,
            tried.Profiles,
            DataModelProfiles.Check(tried),
            outcome.Problems,
            outcome.Probe is null ? null : MappingReview.Summary(rows),
            rows,
            Replaces: stored is not null,
            stored is null ? null : RegistrationChanges.Between(stored, tried));
    }

    /// <summary>
    /// Adds the machine of a proposal, or replaces its registration. Returns null if there is no
    /// such proposal any more. This is the step of a person: no tool of the MCP server calls it.
    /// </summary>
    public async Task<RegistrationOutcome?> CommitAsync(string draftId, CancellationToken cancellationToken)
    {
        if (_drafts.Find(draftId) is not { } draft)
        {
            return null;
        }

        var outcome = await RegisterAsync(draft.Registration, dryRun: false, cancellationToken).ConfigureAwait(false);
        if (outcome.Registered)
        {
            _drafts.Remove(draftId);
        }

        return outcome;
    }

    /// <summary>
    /// Removes a machine completely: closes its session, says <c>Disconnected</c>, resets the alarms
    /// that stand, deletes its registration, and then deletes what it published from the Timeseries
    /// and the Events API. Returns null if no such machine is added.
    /// </summary>
    public async Task<DataDeletion?> RemoveAsync(string serialNumber, CancellationToken cancellationToken)
    {
        await _changes.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var connection = Find(serialNumber);
            await StopAsync(serialNumber).ConfigureAwait(false);
            if (connection is not null)
            {
                await connection.ResetOpenAlertsAsync().ConfigureAwait(false);
            }

            _alertStore.Delete(serialNumber);
            if (!_store.Delete(serialNumber))
            {
                return null;
            }

            _logger.MachineRemoved(serialNumber);
        }
        finally
        {
            _changes.Release();
        }

        // The last values, Disconnected and the resets are on their way to the stores: let them arrive, then delete.
        await Task.Delay(_config.DataSettleTime, cancellationToken).ConfigureAwait(false);
        var deletion = await _eraser.DeleteAsync(serialNumber, cancellationToken).ConfigureAwait(false);
        if (deletion.Problems.Count == 0)
        {
            _logger.MachineDataDeleted(serialNumber, deletion.ValuesDeleted ?? 0, deletion.EventsDeleted ?? 0);
        }
        else
        {
            _logger.MachineDataNotDeleted(serialNumber, string.Join(" ", deletion.Problems));
        }

        return deletion;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        var registrations = _store.LoadAll((file, exception) => _logger.RegistrationUnreadable(file, exception.Message));
        _logger.RegistrationsLoaded(registrations.Count, _config.DataDirectory);
        foreach (var registration in registrations)
        {
            await StartAsync(registration).ConfigureAwait(false);
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The service stops: every machine says Disconnected before the broker connection goes.
        }

        foreach (var serialNumber in _machines.Keys.ToList())
        {
            await StopAsync(serialNumber).ConfigureAwait(false);
        }

        await _pool.DisposeAsync().ConfigureAwait(false);
    }

    public override void Dispose()
    {
        _changes.Dispose();
        base.Dispose();
    }

    private async Task StartAsync(MachineRegistration registration)
    {
        var connection = new MachineConnection(
            registration, _publisher, _alertStore, _config.HeartbeatInterval, _config.SamplingInterval, _logger);
#pragma warning disable CA2000 // Disposed in StopAsync, when the machine is stopped.
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(_stopping);
#pragma warning restore CA2000
        var task = Task.Run(
            async () =>
            {
                try
                {
                    await connection.RunAsync(cancellation.Token).ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One machine that fails in an unforeseen way must not take the others down.
                catch (Exception exception)
#pragma warning restore CA1031
                {
                    _logger.MachineStopped(registration.SerialNumber, exception.Message);
                }
            },
            CancellationToken.None);
        _machines[registration.SerialNumber] = new Running(connection, cancellation, task);

        // The machine takes the session of its endpoint; the first machine on an endpoint opens it.
        await _pool.AddAsync(connection, _stopping).ConfigureAwait(false);
    }

    /// <summary>
    /// Stops a machine: it leaves the session of its endpoint, which closes only with the last
    /// machine on it, and its heartbeat ends.
    /// </summary>
    private async Task StopAsync(string serialNumber)
    {
        if (!_machines.TryRemove(serialNumber, out var running))
        {
            return;
        }

        await _pool.RemoveAsync(running.Connection).ConfigureAwait(false);
        await running.Cancellation.CancelAsync().ConfigureAwait(false);
        await running.Task.ConfigureAwait(false);
        running.Cancellation.Dispose();
    }

    private sealed record Running(MachineConnection Connection, CancellationTokenSource Cancellation, Task Task);
}
