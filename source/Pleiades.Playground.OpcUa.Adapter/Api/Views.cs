using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Api;

// The answers of the adapter, the same over REST and over MCP. A display draws them, a language
// model reads them: each is short and names its machine and its endpoint.

/// <summary>The endpoint of a server and the security of the session.</summary>
/// <param name="Url">The address of the server.</param>
/// <param name="SecurityMode">The message security mode.</param>
/// <param name="SecurityPolicy">The short name of the security policy.</param>
/// <param name="CertificateThumbprint">SHA-1 thumbprint of the certificate the server is known by.</param>
/// <param name="User">The user the session logs in with, or null for a session without a user. Never a password.</param>
internal sealed record EndpointView(string Url, SecurityMode SecurityMode, string SecurityPolicy, string? CertificateThumbprint, string? User = null);

/// <summary>An OPC UA server that is added to the platform.</summary>
/// <param name="SerialNumber">The serial number: how the adapter names the machine.</param>
/// <param name="MachineId">The machine id of its topics, <c>machines/{machineId}/</c>, or null while it is not identified.</param>
/// <param name="DisplayName">A name for people.</param>
/// <param name="Endpoint">Where it is and how the session is secured.</param>
/// <param name="State">As <c>Connection/State</c> on the broker: <c>Initializing</c>, <c>Running</c>, <c>CommunicationFault</c> or <c>Shutdown</c>.</param>
/// <param name="LastError">Why it is not connected.</param>
/// <param name="Profiles">The profiles of the data model it delivers whole, the core among them if it is complete.</param>
/// <param name="Conformance">Each profile of the data model: whether it is complete, and what it lacks. The core first.</param>
/// <param name="Mapping">How many elements are in which state.</param>
/// <param name="NeedsRescan">A registered node is gone from the server: scan it again.</param>
/// <param name="ScannedAt">When the server was last scanned.</param>
/// <param name="MachineNode">The object of the machine on a server that serves several machines.</param>
/// <param name="SessionSharedWith">The other machines on the same session, behind the same endpoint. Empty for a server of one machine.</param>
internal sealed record ServerView(
    string SerialNumber,
    string? MachineId,
    string? DisplayName,
    EndpointView Endpoint,
    string State,
    string? LastError,
    IReadOnlyList<string> Profiles,
    IReadOnlyList<ProfileCheck> Conformance,
    MappingSummary Mapping,
    bool NeedsRescan,
    DateTimeOffset? ScannedAt,
    string? MachineNode,
    IReadOnlyList<string> SessionSharedWith);

/// <summary>The added OPC UA servers.</summary>
/// <param name="Servers">One entry per machine.</param>
internal sealed record ServerListView(IReadOnlyList<ServerView> Servers);

/// <summary>The mapping of one machine, element by element.</summary>
/// <param name="Server">The machine.</param>
/// <param name="Rows">Every element, what needs a look first.</param>
internal sealed record MappingView(ServerView Server, IReadOnlyList<MappingRow> Rows);

/// <summary>One endpoint a server offers.</summary>
/// <param name="SecurityMode">The message security mode.</param>
/// <param name="SecurityPolicy">The short name of the security policy.</param>
/// <param name="Recommended">True for the one to register.</param>
/// <param name="Weak">True without encryption or with a policy that is no longer considered safe.</param>
internal sealed record RankedEndpointView(SecurityMode SecurityMode, string SecurityPolicy, bool Recommended, bool Weak);

/// <summary>The endpoints of a server, strongest first.</summary>
/// <param name="Url">The address that was asked.</param>
/// <param name="CertificateThumbprint">SHA-1 thumbprint of the certificate the server presents.</param>
/// <param name="Endpoints">The endpoints a session can use: with the stored user if there is one, else without a user.</param>
/// <param name="NeedsUser">True if the server accepts no session without a user.</param>
/// <param name="AcceptsUser">True if the server accepts a user name and a password on an encrypted endpoint.</param>
/// <param name="User">The user a person stored for this server, or null. Never a password.</param>
internal sealed record EndpointRankView(
    string Url,
    string? CertificateThumbprint,
    IReadOnlyList<RankedEndpointView> Endpoints,
    bool NeedsUser,
    bool AcceptsUser,
    string? User);

/// <summary>A user a person stored for a server. The password is never shown.</summary>
/// <param name="Url">The address of the server.</param>
/// <param name="User">The user name.</param>
internal sealed record StoredUserView(string Url, string User);

/// <summary>The servers with a stored user.</summary>
/// <param name="Users">One entry per server.</param>
internal sealed record StoredUserListView(IReadOnlyList<StoredUserView> Users);

/// <summary>A machine an OPC UA server serves.</summary>
/// <param name="Node">The object of the machine: the <c>machineNode</c> of its registration.</param>
/// <param name="Path">Where it is below Objects, by names.</param>
/// <param name="DisplayName">Its name on the server.</param>
/// <param name="SerialNumber">The serial number read below it: the <c>serialNumber</c> of its registration. Null if it has none.</param>
/// <param name="Manufacturer">Its manufacturer, as read.</param>
/// <param name="Model">Its model, as read.</param>
/// <param name="ProductInstanceUri">Its product instance URI, as read.</param>
/// <param name="Added">Whether a machine with this serial number is added already.</param>
/// <param name="AddedAt">The endpoint it is added at, if it is added.</param>
internal sealed record ServedMachineView(
    string Node,
    string Path,
    string DisplayName,
    string? SerialNumber,
    string? Manufacturer,
    string? Model,
    string? ProductInstanceUri,
    bool Added,
    string? AddedAt);

/// <summary>The machines an OPC UA server serves.</summary>
/// <param name="Url">The address of the server.</param>
/// <param name="Endpoint">The strongest endpoint: the machines were read on it, and a registration names it.</param>
/// <param name="Gateway">True if the server serves more than one machine: every registration then names its machineNode.</param>
/// <param name="Machines">The machines, the ones nearest to Objects first.</param>
internal sealed record MachineListView(string Url, RankedEndpointView? Endpoint, bool Gateway, IReadOnlyList<ServedMachineView> Machines);

/// <summary>A registration that was tried against its server and waits for a person's yes.</summary>
/// <param name="Accepted">True if the proposal is kept and can be added. False: see <paramref name="Problems"/>.</param>
/// <param name="DraftId">What the yes of the person names. Null if the proposal was not accepted.</param>
/// <param name="ExpiresAt">When the proposal is forgotten.</param>
/// <param name="SerialNumber">The machine.</param>
/// <param name="DisplayName">A name for people.</param>
/// <param name="Endpoint">The endpoint and the certificate the server presented.</param>
/// <param name="Profiles">The profiles the proposal delivers whole: only their elements are published.</param>
/// <param name="Conformance">Each profile of the data model: whether it is complete, and what it lacks. The core first; without it the machine is not added.</param>
/// <param name="Problems">Why the proposal was not accepted, one reason each.</param>
/// <param name="Summary">How many elements are in which state.</param>
/// <param name="Rows">Every element with the value its node gave, what needs a look first.</param>
/// <param name="Replaces">True if the machine is added already: the proposal would replace its registration.</param>
/// <param name="Changes">What would change against the stored registration.</param>
/// <param name="MachineId">The machine id the machine would publish under, or null if the proposal was not accepted.</param>
/// <param name="Notices">What the person should know, though nothing is wrong: for example a machine id whose manufacturer is not the web address of the manufacturer.</param>
internal sealed record ProposalView(
    bool Accepted,
    string? DraftId,
    DateTimeOffset? ExpiresAt,
    string SerialNumber,
    string? DisplayName,
    EndpointView Endpoint,
    IReadOnlyList<string> Profiles,
    IReadOnlyList<ProfileCheck> Conformance,
    IReadOnlyList<string> Problems,
    MappingSummary? Summary,
    IReadOnlyList<MappingRow> Rows,
    bool Replaces,
    RegistrationChanges? Changes,
    string? MachineId,
    IReadOnlyList<string> Notices);

/// <summary>Builds the answers from what the adapter holds.</summary>
internal static class Views
{
    /// <summary>What the person should know of an identity, one sentence each: none for a server that gave all of it.</summary>
    public static IReadOnlyList<string> Notices(IdentityRegistration? identity) =>
        identity is { ManufacturerUriFromManufacturer: true }
            ?
            [
                $"Identification.ManufacturerUri: the server has no node for it, so the manufacturer \"{identity.Manufacturer}\" " +
                $"without its special characters, \"{identity.ManufacturerUri}\", stands in for it. The machine publishes as " +
                $"{identity.MachineId}.",
            ]
            : [];

    public static EndpointView Endpoint(EndpointRegistration endpoint) =>
        new(endpoint.Url, endpoint.SecurityMode, endpoint.SecurityPolicy, endpoint.ServerCertificateThumbprint, endpoint.User);

    public static ServerView Server(MachineConnection connection, IReadOnlyList<string> sharing) => Mapping(connection, sharing).Server;

    public static MappingView Mapping(MachineConnection connection, IReadOnlyList<string> sharing)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(sharing);
        var registration = connection.Registration;
        var status = connection.Status;
        var rows = MappingReview.Rows(
            registration,
            [.. status.Elements.Select(element => new ElementCheck(
                element.Area,
                element.Path,
                element.Status,
                NodeFound: !IsNodeGone(element.Status),
                element.Value))]);
        // Checked again on every view: a registration stored before the core was enforced shows what it lacks.
        var conformance = DataModelProfiles.Check(registration);
        var server = new ServerView(
            registration.SerialNumber,
            status.MachineId ?? registration.Identity?.MachineId,
            registration.DisplayName,
            Endpoint(registration.Endpoint),
            status.State,
            status.LastError,
            [.. conformance.Where(check => check.Fulfilled).Select(check => check.Name)],
            conformance,
            MappingReview.Summary(rows),
            status.NeedsRescan,
            registration.Discovery?.At,
            registration.MachineNode,
            [.. sharing.Where(serialNumber => !string.Equals(serialNumber, registration.SerialNumber, StringComparison.Ordinal))]);
        return new MappingView(server, rows);
    }

    public static EndpointRankView Ranking(EndpointOffer offer)
    {
        ArgumentNullException.ThrowIfNull(offer);
        var ranked = offer.Ranked;
        return new(
            offer.Url,
            offer.Offered.Select(one => one.ServerCertificateThumbprint).FirstOrDefault(thumbprint => thumbprint is not null),
            [.. ranked.Select(one => new RankedEndpointView(one.Endpoint.SecurityMode, one.Endpoint.SecurityPolicy, one.Recommended, one.Weak))],
            offer.NeedsUser,
            offer.AcceptsUser,
            offer.User);
    }

    public static MachineListView Machines(ServedMachines served, IReadOnlyList<MachineConnection> added)
    {
        ArgumentNullException.ThrowIfNull(served);
        ArgumentNullException.ThrowIfNull(added);
        var best = served.Endpoints.Count > 0 ? served.Endpoints[0] : null;
        return new MachineListView(
            served.Url,
            best is null ? null : new RankedEndpointView(best.Endpoint.SecurityMode, best.Endpoint.SecurityPolicy, best.Recommended, best.Weak),
            served.Machines.Count > 1,
            [.. served.Machines.Select(machine =>
            {
                var registered = added.FirstOrDefault(one => string.Equals(one.Registration.SerialNumber, machine.SerialNumber, StringComparison.Ordinal));
                return new ServedMachineView(
                    machine.Node,
                    machine.Path,
                    machine.DisplayName,
                    machine.SerialNumber,
                    machine.Manufacturer,
                    machine.Model,
                    machine.ProductInstanceUri,
                    registered is not null,
                    registered?.Registration.Endpoint.Url);
            })]);
    }

    public static IReadOnlyList<MappingRow> Rows(MachineRegistration registration, ProbeResult probe) =>
        MappingReview.Rows(
            registration,
            [.. probe.Elements.Select(element => new ElementCheck(element.Area, element.Path, element.Status, element.NodeFound, element.Value))]);

    // A monitored item the server refused because it does not know the node, or a namespace that is gone.
    private static bool IsNodeGone(string status) =>
        status.Contains("BadNodeIdUnknown", StringComparison.Ordinal)
        || status.Contains("BadNodeIdInvalid", StringComparison.Ordinal)
        || status.StartsWith("NamespaceUnknown", StringComparison.Ordinal);
}
