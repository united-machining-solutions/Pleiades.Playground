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
    /// <summary>Whether the machine is registered now.</summary>
    public bool Registered => Registration is not null && Problems.Count == 0;
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
    private readonly SemaphoreSlim _changes = new(1, 1);
    private readonly RegistrationStore _store;
    private readonly AlertStore _alertStore;
    private readonly OpcUaClient _client;
    private readonly RegistrationProbe _probe;
    private readonly IMachinePublisher _publisher;
    private readonly DraftStore _drafts;
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
        IOptions<Config> config,
        ILogger<MachineSupervisor> logger)
    {
        _store = store;
        _alertStore = alertStore;
        _client = client;
        _probe = probe;
        _publisher = publisher;
        _drafts = drafts;
        _config = config.Value;
        _logger = logger;
    }

    /// <summary>The machines that are registered, by serial number.</summary>
    public IReadOnlyList<MachineConnection> Machines =>
        [.. _machines.Values.Select(running => running.Connection).OrderBy(connection => connection.Registration.SerialNumber, StringComparer.Ordinal)];

    /// <summary>The connection of one machine, or null if it is not registered.</summary>
    public MachineConnection? Find(string serialNumber) =>
        _machines.TryGetValue(serialNumber, out var running) ? running.Connection : null;

    /// <summary>The endpoints of a server, strongest first.</summary>
    public async Task<IReadOnlyList<RankedEndpoint>> RankEndpointsAsync(string url, CancellationToken cancellationToken) =>
        EndpointRanking.Rank(await _client.GetEndpointsAsync(url, cancellationToken).ConfigureAwait(false));

    /// <summary>
    /// Checks a registration against its server and, unless <paramref name="dryRun"/>, stores it and
    /// starts the machine. A machine that is registered already is replaced: this is how a scan
    /// that found new profiles is applied.
    /// </summary>
    public async Task<RegistrationOutcome> RegisterAsync(MachineRegistration registration, bool dryRun, CancellationToken cancellationToken)
    {
        var problems = RegistrationValidator.Validate(registration);
        if (problems.Count > 0)
        {
            return new RegistrationOutcome(null, problems, null, null);
        }

        // The strongest endpoint the server offers is taken, unless a person decided otherwise.
        var endpoints = await RankEndpointsAsync(registration.Endpoint.Url, cancellationToken).ConfigureAwait(false);
        var chosen = endpoints.FirstOrDefault(ranked =>
            ranked.Endpoint.SecurityMode == registration.Endpoint.SecurityMode
            && ranked.Endpoint.SecurityPolicy == registration.Endpoint.SecurityPolicy);
        if (chosen is null)
        {
            return new RegistrationOutcome(null, ["endpoint: the server offers no such endpoint for a session without a user."], endpoints, null);
        }

        if ((!chosen.Recommended || chosen.Weak) && !registration.Endpoint.AllowWeaker)
        {
            var best = endpoints[0].Endpoint;
            return new RegistrationOutcome(
                null,
                [$"endpoint: the server offers {best.SecurityMode} with {best.SecurityPolicy}, which is stronger. Take it, or set endpoint.allowWeaker if a person decided for the weaker one."],
                endpoints,
                null);
        }

        var probe = await _probe.ProbeAsync(registration, cancellationToken).ConfigureAwait(false);
        if (probe.NotFound.Count > 0)
        {
            return new RegistrationOutcome(
                null,
                [.. probe.NotFound.Select(element => $"elements[{element.Path}]: the server has no node {element.Node}.")],
                endpoints,
                probe);
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
            Start(stored);
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
        var tried = outcome.Registration ?? registration;
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
            registration.Profiles,
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
    /// Removes a machine: closes its session, says <c>Disconnected</c>, resets the alarms that stand
    /// and deletes its registration. What it published stays stored until the retention ends.
    /// </summary>
    public async Task<bool> RemoveAsync(string serialNumber, CancellationToken cancellationToken)
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
            var removed = _store.Delete(serialNumber);
            if (removed)
            {
                _logger.MachineRemoved(serialNumber);
            }

            return removed;
        }
        finally
        {
            _changes.Release();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        var registrations = _store.LoadAll((file, exception) => _logger.RegistrationUnreadable(file, exception.Message));
        _logger.RegistrationsLoaded(registrations.Count, _config.DataDirectory);
        foreach (var registration in registrations)
        {
            Start(registration);
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The service stops: every machine says Disconnected before the broker connection goes.
        }

        await Task.WhenAll(_machines.Keys.ToList().Select(StopAsync)).ConfigureAwait(false);
    }

    public override void Dispose()
    {
        _changes.Dispose();
        base.Dispose();
    }

    private void Start(MachineRegistration registration)
    {
        var connection = new MachineConnection(
            registration, _client, _publisher, _alertStore, _config.HeartbeatInterval, _config.SamplingInterval, _logger);
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
    }

    private async Task StopAsync(string serialNumber)
    {
        if (!_machines.TryRemove(serialNumber, out var running))
        {
            return;
        }

        await running.Cancellation.CancelAsync().ConfigureAwait(false);
        await running.Task.ConfigureAwait(false);
        running.Cancellation.Dispose();
    }

    private sealed record Running(MachineConnection Connection, CancellationTokenSource Cancellation, Task Task);
}
