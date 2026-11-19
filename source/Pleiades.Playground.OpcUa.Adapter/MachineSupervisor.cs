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

/// <summary>The endpoints a server offers, and the user and the security a person stored for it.</summary>
/// <param name="Url">The address that was asked.</param>
/// <param name="Offered">Every endpoint of the server.</param>
/// <param name="User">The user a person stored for this server, or null.</param>
/// <param name="Choice">The security a person chose for this server, or null for the strongest.</param>
internal sealed record EndpointOffer(string Url, IReadOnlyList<OfferedEndpoint> Offered, string? User, SecurityChoice? Choice = null)
{
    /// <summary>
    /// The endpoints a session can use, strongest first: those without a user, and with the stored user the
    /// encrypted ones that take it. The one the adapter takes is <see cref="RankedEndpoint.Recommended"/>.
    /// </summary>
    public IReadOnlyList<RankedEndpoint> Ranked => EndpointRanking.ForSession(Offered, withStoredUser: User is not null, Choice);

    /// <summary>The endpoint the adapter takes: the one a person chose, else the strongest. Null if none can be used.</summary>
    public RankedEndpoint? Used => Ranked.FirstOrDefault(endpoint => endpoint.Recommended);

    /// <summary>The choice of a person, if the endpoint the adapter takes is the one chosen; null for the strongest.</summary>
    public SecurityChoice? ChoiceInEffect =>
        Choice is { } choice && Used is { } used && choice.Matches(used.Endpoint.SecurityMode, used.Endpoint.SecurityPolicy) ? choice : null;

    /// <summary>
    /// Where the stored user logs in when the server refused an anonymous session on <paramref name="refused"/>, an
    /// endpoint the user cannot take (one without encryption a person chose): that endpoint if it is encrypted and
    /// takes a user name, else the strongest encrypted endpoint that does. A password never goes over an endpoint
    /// without encryption. Null if there is none.
    /// </summary>
    public RankedEndpoint? UserEndpointAfter(RankedEndpoint refused)
    {
        ArgumentNullException.ThrowIfNull(refused);
        if (refused.Endpoint.UserName && refused.Endpoint.SecurityMode == SecurityMode.SignAndEncrypt)
        {
            return refused with { WithUser = true };
        }

        return EndpointRanking.Rank(Offered, withUser: true) is [var best, ..] ? best : null;
    }

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

/// <summary>What came of the removal of a machine.</summary>
internal enum MachineRemoval
{
    /// <summary>Removed, and its retained messages taken back from the broker.</summary>
    Removed = 0,

    /// <summary>No such machine is added.</summary>
    NotAdded = 1,

    /// <summary>Not removed: the broker cannot be reached, so its retained messages could not be taken back.</summary>
    BrokerUnreachable = 2,
}

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
    private readonly SemaphoreSlim _changes = new(1, 1);
    private readonly RegistrationStore _store;
    private readonly AlertStore _alertStore;
    private readonly OpcUaClient _client;
    private readonly IRegistrationProbe _probe;
    private readonly IMachineOutputFactory _outputs;
    private readonly DraftStore _drafts;
    private readonly CredentialStore _credentials;
    private readonly SecurityChoiceStore _choices;
    private readonly Config _config;
    private readonly ILogger<MachineSupervisor> _logger;
    private CancellationToken _stopping;

    public MachineSupervisor(
        RegistrationStore store,
        AlertStore alertStore,
        OpcUaClient client,
        IRegistrationProbe probe,
        IMachineOutputFactory outputs,
        DraftStore drafts,
        CredentialStore credentials,
        SecurityChoiceStore choices,
        IOptions<Config> config,
        ILogger<MachineSupervisor> logger)
    {
        _credentials = credentials;
        _choices = choices;
        _store = store;
        _alertStore = alertStore;
        _client = client;
        _probe = probe;
        _outputs = outputs;
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
    /// The machines a server serves, read on the endpoint the adapter takes (the strongest, or the one a person
    /// chose): one for the server of a machine, several for an aggregation server. The session is anonymous
    /// first; the stored user logs in only where the endpoint takes no anonymous session, or the server refused
    /// it. Nothing is stored.
    /// </summary>
    public async Task<ServedMachines> FindMachinesAsync(string url, CancellationToken cancellationToken)
    {
        url = EndpointKey.Trim(url);
        var offer = await OfferAsync(url, cancellationToken).ConfigureAwait(false);
        var endpoints = offer.Ranked;
        if (offer.Used is not { } used)
        {
            if (offer.NeedsUser && offer.User is null)
            {
                throw new CredentialMissingException(WantsUser(url, offer));
            }

            return new ServedMachines(url, endpoints, []);
        }

        var session = await ConnectAnonymousFirstAsync(offer, used, cancellationToken).ConfigureAwait(false);
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

    /// <summary>
    /// Opens a session on <paramref name="used"/>: with the stored user where the endpoint takes it, else anonymous.
    /// If the server refuses the anonymous session and a user is stored, the user logs in on an encrypted endpoint.
    /// </summary>
    private async Task<Opc.Ua.Client.ManagedSession> ConnectAnonymousFirstAsync(EndpointOffer offer, RankedEndpoint used, CancellationToken cancellationToken)
    {
        if (used.WithUser)
        {
            return (await _client.ConnectAsync(Registration(offer.Url, used, offer.User), cancellationToken).ConfigureAwait(false)).Session;
        }

        var withUser = offer.User is null ? null : offer.UserEndpointAfter(used);
        try
        {
            return (await _client.ConnectAsync(Registration(offer.Url, used, user: null), cancellationToken).ConfigureAwait(false)).Session;
        }
        catch (Exception exception) when (RefusalPolicy.IsRefusedIdentity(exception) && withUser is not null)
        {
            return (await _client.ConnectAsync(Registration(offer.Url, withUser, offer.User), cancellationToken).ConfigureAwait(false)).Session;
        }
    }

    private static EndpointRegistration Registration(string url, RankedEndpoint endpoint, string? user) => new()
    {
        Url = url,
        SecurityMode = endpoint.Endpoint.SecurityMode,
        SecurityPolicy = endpoint.Endpoint.SecurityPolicy,
        User = user,
    };

    /// <summary>
    /// Whether the server refuses an anonymous session on <paramref name="endpoint"/>. The adapter's own client
    /// stops at once on a refused identity (<see cref="RefusalPolicy"/>), so this answers within a second where
    /// the scan session of the OPC UA MCP library would try again until its timeout. Any other failure is no
    /// refusal: the connect that follows reports it.
    /// </summary>
    public async Task<bool> RefusesAnonymousAsync(string url, OfferedEndpoint endpoint, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        var registration = new EndpointRegistration
        {
            Url = EndpointKey.Trim(url),
            SecurityMode = endpoint.SecurityMode,
            SecurityPolicy = endpoint.SecurityPolicy,
        };
        try
        {
            var (session, _) = await _client.ConnectAsync(registration, cancellationToken).ConfigureAwait(false);
            var tried = new ManagedEndpointSession(session);
            await using (tried.ConfigureAwait(false))
            {
                await tried.CloseAsync().ConfigureAwait(false);
            }

            return false;
        }
        catch (Exception exception) when (RefusalPolicy.IsRefusedIdentity(exception))
        {
            return true;
        }
        catch (Exception exception) when (MachineEndpointsFault(exception))
        {
            return false;
        }
    }

    /// <summary>The endpoints of a server, and the user and the security a person stored for it.</summary>
    public async Task<EndpointOffer> OfferAsync(string url, CancellationToken cancellationToken)
    {
        url = EndpointKey.Trim(url);
        var offered = await _client.GetEndpointsAsync(url, cancellationToken).ConfigureAwait(false);
        return new EndpointOffer(url, offered, _credentials.Find(url)?.User, _choices.Find(url));
    }

    /// <summary>
    /// Keeps the security a person chose for a server: the adapter takes that endpoint from now on, for the scan and
    /// for every registration proposed after, also if it is weaker than the strongest one or has no security at
    /// all. Returns why not, or null if it is kept. A machine that is added already keeps the security of its
    /// registration until it is registered again.
    /// </summary>
    public async Task<string?> SaveSecurityAsync(string url, SecurityChoice choice, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(choice);
        url = EndpointKey.Trim(url);
        var offer = await OfferAsync(url, cancellationToken).ConfigureAwait(false);
        if (!offer.Ranked.Any(endpoint => choice.Matches(endpoint.Endpoint.SecurityMode, endpoint.Endpoint.SecurityPolicy)))
        {
            return offer.Offered.Any(endpoint => choice.Matches(endpoint.SecurityMode, endpoint.SecurityPolicy))
                ? $"The server at {url} takes no anonymous session on the endpoint with {choice.SecurityMode} and {choice.SecurityPolicy}, " +
                  "and a user logs in over an encrypted endpoint only."
                : $"The server at {url} offers no endpoint with {choice.SecurityMode} and {choice.SecurityPolicy}.";
        }

        _choices.Save(url, choice);
        _logger.SecurityChosen(url, choice.SecurityMode.ToString(), choice.SecurityPolicy);
        if (choice.SecurityMode == SecurityMode.None)
        {
            _logger.SecurityNoneChosen(url);
        }

        return null;
    }

    /// <summary>Forgets the security chosen for a server: the adapter takes the strongest endpoint again.</summary>
    public bool RemoveSecurity(string url)
    {
        var removed = _choices.Remove(EndpointKey.Trim(url));
        if (removed)
        {
            _logger.SecurityChoiceRemoved(EndpointKey.Trim(url));
        }

        return removed;
    }

    /// <summary>The servers with a chosen security.</summary>
    public IReadOnlyList<StoredSecurityChoice> SecurityChoices => _choices.Choices;

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
            var (session, thumbprint) = await _client.ConnectAsync(endpoint, trial.Token, credential).ConfigureAwait(false);
            credential = credential with { ServerCertificateThumbprint = thumbprint };
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
        await ReconnectWithUserAsync(offer, credential.User, cancellationToken).ConfigureAwait(false);
        return null;
    }

    /// <summary>
    /// The registrations of the machines at the server of <paramref name="offer"/> that start their session anew with
    /// <paramref name="user"/>: those on an encrypted endpoint that takes a user name, whatever user they logged in
    /// with before, the password may be new. A machine on an endpoint without encryption stays anonymous.
    /// </summary>
    internal static IReadOnlyList<MachineRegistration> ReconnectingWithUser(
        IEnumerable<MachineRegistration> registrations, EndpointOffer offer, string user)
    {
        ArgumentNullException.ThrowIfNull(registrations);
        ArgumentNullException.ThrowIfNull(offer);
        var url = EndpointKey.Normalize(offer.Url);
        return
        [
            .. registrations
                .Where(registration => EndpointKey.Normalize(registration.Endpoint.Url) == url
                    && registration.Endpoint.SecurityMode == SecurityMode.SignAndEncrypt
                    && offer.Offered.Any(endpoint => Same(endpoint, registration.Endpoint) && endpoint.UserName))
                .Select(registration => registration with { Endpoint = registration.Endpoint with { User = user } }),
        ];
    }

    /// <summary>
    /// A person stored a user for a server: the machines that run there start their session anew with it, so the
    /// user the person chose is the one their sessions log in with, not an anonymous session that may see less.
    /// </summary>
    private async Task ReconnectWithUserAsync(EndpointOffer offer, string user, CancellationToken cancellationToken)
    {
        var reconnecting = ReconnectingWithUser(Machines.Select(machine => machine.Registration), offer, user);
        if (reconnecting.Count == 0)
        {
            return;
        }

        await _changes.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            foreach (var registration in reconnecting)
            {
                await StopAsync(registration.SerialNumber, removed: false).ConfigureAwait(false);
                _store.Save(registration);
                await StartAsync(registration).ConfigureAwait(false);
                _logger.MachineReconnectsWithUser(registration.SerialNumber, user);
            }
        }
        finally
        {
            _changes.Release();
        }
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

    private static bool Same(OfferedEndpoint offered, EndpointRegistration endpoint) =>
        offered.SecurityMode == endpoint.SecurityMode && string.Equals(offered.SecurityPolicy, endpoint.SecurityPolicy, StringComparison.Ordinal);

    /// <summary>
    /// Checks a registration against its server and, unless <paramref name="dryRun"/>, stores it and
    /// starts the machine. A machine that is registered already is replaced: this is how a scan
    /// that found new profiles is applied.
    /// </summary>
    public async Task<RegistrationOutcome> RegisterAsync(MachineRegistration registration, bool dryRun, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(registration);
        registration = RegistrationStore.Migrate(registration);
        registration = registration with { Endpoint = registration.Endpoint with { Url = EndpointKey.Trim(registration.Endpoint.Url) } };

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

        // The user a person stored for the server is the user of the session wherever the endpoint is encrypted and
        // takes a user name, also where it takes anonymous sessions: an anonymous session may see less. Without a
        // stored user the session is anonymous. The password stays in the store.
        if (registration.Endpoint.User is null
            && offer.User is { } storedUser
            && offer.Offered.Any(endpoint => Same(endpoint, registration.Endpoint) && endpoint.UserName && endpoint.SecurityMode == SecurityMode.SignAndEncrypt))
        {
            registration = registration with { Endpoint = registration.Endpoint with { User = storedUser } };
        }

        var endpoints = offer.Ranked;
        var chosen = endpoints.FirstOrDefault(ranked =>
            Same(ranked.Endpoint, registration.Endpoint)
            && (registration.Endpoint.User is null
                ? ranked.Endpoint.Anonymous
                : ranked.Endpoint.UserName && ranked.Endpoint.SecurityMode == SecurityMode.SignAndEncrypt));
        if (chosen is null)
        {
            var problem = registration.Endpoint.User is null && offer.NeedsUser
                ? $"endpoint: {WantsUser(registration.Endpoint.Url, offer)} Then propose again."
                : registration.Endpoint.User is null
                    ? "endpoint: the server offers no such endpoint for a session without a user."
                    : "endpoint: the server offers no such endpoint for a session with a user name.";
            return new RegistrationOutcome(null, [problem], endpoints, null) { Tried = registration };
        }

        // A weaker endpoint, or one without encryption, is the decision of a person: chosen on the endpoints card,
        // or set in endpoint.allowWeaker of a registration a person wrote. Never a default, never the model's.
        var strongest = endpoints[0];
        var weaker = chosen.Score < strongest.Score || chosen.Weak;
        var personal = offer.Choice is { } choice && choice.Matches(chosen.Endpoint.SecurityMode, chosen.Endpoint.SecurityPolicy);
        if (weaker && !registration.Endpoint.AllowWeaker && !personal)
        {
            var best = strongest.Endpoint;
            var problem = chosen.Score < strongest.Score
                ? $"endpoint: the server offers {best.SecurityMode} with {best.SecurityPolicy}, which is stronger. Take it; only a person may choose a weaker one, on the endpoints card of opcua_endpoint_rank."
                : $"endpoint: {chosen.Endpoint.SecurityMode} with {chosen.Endpoint.SecurityPolicy} is weak, and no person chose it. A person may choose it on the endpoints card of opcua_endpoint_rank.";
            return new RegistrationOutcome(null, [problem], endpoints, null) { Tried = registration };
        }

        // The registration keeps the decision of the person, so that it stands when the machine is registered again.
        if (weaker && personal)
        {
            registration = registration with { Endpoint = registration.Endpoint with { AllowWeaker = true } };
        }

        var probe = await _probe.ProbeAsync(registration, cancellationToken).ConfigureAwait(false);

        // An element a known namespace set and the server does not fill is missing, not wrong.
        registration = Umati2DataModel.WithoutAbsent(registration, probe.NotFound.Select(element => (element.Area, element.Path)), out var absent);
        if (absent.Count > 0)
        {
            probe = probe with { Elements = [.. probe.Elements.Where(element => !(element.Area == "umati" && absent.Contains(element.Path)))] };
        }

        // So is the list of alerts it set, and the alarm type of a TRUMPF machine: the alerts are then not available.
        if (!probe.AlertListFound)
        {
            registration = Umati2DataModel.WithoutAlertList(registration);
        }

        if (!probe.AlertEventTypeFound)
        {
            registration = TrumpfAlarms.WithoutEventType(registration);
        }

        // An element that left makes its profile incomplete; the core decides whether the machine is added.
        var before = registration.Elements;
        registration = DataModelProfiles.Apply(registration, out var checks);
        if (registration.Elements.Count != before.Count)
        {
            probe = probe with { Elements = [.. probe.Elements.Where(element => registration.Elements.Any(kept => kept.Area == element.Area && kept.Path == element.Path))] };
        }

        // An element of the core the machine lacks is declared as not available, as the other adapters do; the
        // machine is added all the same. Only the parts of the machine id are required, below.
        var refused = new List<string>();
        refused.AddRange(probe.NotFound.Select(element => $"elements[{element.Path}]: the server has no node {element.Node}."));
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

        // The machine id of every topic and the source of every event: from the identification the server gave now.
        var identity = MachineOutput.IdentityOf(path => probe.ValueOf(path), registration);
        if (identity is null)
        {
            return new RegistrationOutcome(
                null,
                [MachineOutput.IdentityProblem(path => probe.ValueOf(path), registration)],
                endpoints,
                probe) { Tried = registration };
        }

        // The certificate the server presents now is the one this machine is known by from here on.
        var stored = registration with
        {
            Endpoint = registration.Endpoint with
            {
                ServerCertificateThumbprint = registration.Endpoint.ServerCertificateThumbprint ?? probe.ServerCertificateThumbprint,
            },
            Discovery = (registration.Discovery ?? new DiscoveryRecord()) with { Namespaces = probe.Namespaces },
            Identity = identity,
            SchemaVersion = MachineRegistration.CurrentSchemaVersion,
        };
        if (dryRun)
        {
            return new RegistrationOutcome(stored, [], endpoints, probe);
        }

        await _changes.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await StopAsync(stored.SerialNumber, removed: false).ConfigureAwait(false);
            _store.Save(stored);
            await StartAsync(stored).ConfigureAwait(false);
        }
        finally
        {
            _changes.Release();
        }

        _logger.MachineRegistered(stored.SerialNumber, identity.MachineId ?? stored.SerialNumber, stored.Elements.Count, string.Join(", ", stored.Profiles));
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
            stored is null ? null : RegistrationChanges.Between(stored, tried),
            outcome.Registration?.Identity?.MachineId,
            Views.Notices(outcome.Registration?.Identity));
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
    /// Removes a machine: closes its session, clears the alarms that stand, takes its retained messages back
    /// from the broker and deletes its registration. What the stores kept of it stays: deleting it is a step
    /// of its own, with a contract of its own.
    /// </summary>
    /// <returns>
    /// <see cref="MachineRemoval.NotAdded"/> if no such machine is added; <see cref="MachineRemoval.BrokerUnreachable"/>
    /// if the broker cannot be reached, so that its retained messages could not be taken back: then the machine stays
    /// as it was, and the removal can be tried again.
    /// </returns>
    public async Task<MachineRemoval> RemoveAsync(string serialNumber, CancellationToken cancellationToken)
    {
        await _changes.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_machines.TryGetValue(serialNumber, out var running) && !running.Connection.Output.CanTakeBack)
            {
                _logger.MachineNotRemoved(serialNumber);
                return MachineRemoval.BrokerUnreachable;
            }

            await StopAsync(serialNumber, removed: true).ConfigureAwait(false);
            _alertStore.Delete(serialNumber);
            if (!_store.Delete(serialNumber))
            {
                return MachineRemoval.NotAdded;
            }

            _logger.MachineRemoved(serialNumber);
        }
        finally
        {
            _changes.Release();
        }

        return MachineRemoval.Removed;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        var registrations = _store.LoadAll((file, exception) => _logger.RegistrationUnreadable(file, exception.Message));
        _logger.RegistrationsLoaded(registrations.Count, _config.DataDirectory);
        var machineIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var registration in registrations)
        {
            // Two files of one machine, copied from another adapter for example, would run it twice, and the first
            // one could not be stopped any more: the first file wins, the other is left alone and named.
            if (_machines.ContainsKey(registration.SerialNumber)
                || (registration.Identity?.MachineId is { } machineId && !machineIds.Add(machineId)))
            {
                _logger.RegistrationDuplicate(registration.SerialNumber, registration.Identity?.MachineId ?? registration.SerialNumber);
                continue;
            }

            await StartAsync(registration).ConfigureAwait(false);
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The service stops: every machine says Shutdown before its broker connection goes.
        }

        foreach (var serialNumber in _machines.Keys.ToList())
        {
            await StopAsync(serialNumber, removed: false).ConfigureAwait(false);
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
            registration, _outputs, _alertStore, _config.HeartbeatInterval, _config.SamplingInterval, _logger, identity => Remember(registration, identity));
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
    /// machine on it, and its heartbeat ends. Its output says <c>Shutdown</c>; a machine that is
    /// removed clears its alarms first and takes its retained messages back instead.
    /// </summary>
    private async Task StopAsync(string serialNumber, bool removed)
    {
        if (!_machines.TryRemove(serialNumber, out var running))
        {
            return;
        }

        await _pool.RemoveAsync(running.Connection).ConfigureAwait(false);
        await running.Cancellation.CancelAsync().ConfigureAwait(false);
        await running.Task.ConfigureAwait(false);
        running.Cancellation.Dispose();
        if (removed)
        {
            await running.Connection.ResetOpenAlertsAsync().ConfigureAwait(false);
        }

        await running.Connection.Output.StopAsync(removed).ConfigureAwait(false);
        await running.Connection.Output.DisposeAsync().ConfigureAwait(false);
    }

    /// <summary>
    /// Keeps the identity a machine learned from its first values with its registration, so that it keeps its
    /// machine id after a restart, also while it does not answer.
    /// </summary>
    private void Remember(MachineRegistration registration, IdentityRegistration identity)
    {
        try
        {
            _store.Save(registration with { Identity = identity, SchemaVersion = MachineRegistration.CurrentSchemaVersion });
            _logger.MachineIdentified(registration.SerialNumber, identity.MachineId ?? string.Empty);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            _logger.RegistrationUnreadable(registration.SerialNumber, exception.Message);
        }
    }

    private sealed record Running(MachineConnection Connection, CancellationTokenSource Cancellation, Task Task);
}
