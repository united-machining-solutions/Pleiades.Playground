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
internal sealed record EndpointView(string Url, SecurityMode SecurityMode, string SecurityPolicy, string? CertificateThumbprint);

/// <summary>An OPC UA server that is added to the platform.</summary>
/// <param name="SerialNumber">The machine id in every topic.</param>
/// <param name="DisplayName">A name for people.</param>
/// <param name="Endpoint">Where it is and how the session is secured.</param>
/// <param name="State"><c>Connecting</c>, <c>Connected</c> or <c>Disconnected</c>.</param>
/// <param name="LastError">Why it is not connected.</param>
/// <param name="Profiles">The profiles of the data model it delivers.</param>
/// <param name="Mapping">How many elements are in which state.</param>
/// <param name="NeedsRescan">A registered node is gone from the server: scan it again.</param>
/// <param name="ScannedAt">When the server was last scanned.</param>
internal sealed record ServerView(
    string SerialNumber,
    string? DisplayName,
    EndpointView Endpoint,
    string State,
    string? LastError,
    IReadOnlyList<string> Profiles,
    MappingSummary Mapping,
    bool NeedsRescan,
    DateTimeOffset? ScannedAt);

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
/// <param name="Endpoints">The endpoints a session without a user can use.</param>
internal sealed record EndpointRankView(string Url, string? CertificateThumbprint, IReadOnlyList<RankedEndpointView> Endpoints);

/// <summary>A registration that was tried against its server and waits for a person's yes.</summary>
/// <param name="Accepted">True if the proposal is kept and can be added. False: see <paramref name="Problems"/>.</param>
/// <param name="DraftId">What the yes of the person names. Null if the proposal was not accepted.</param>
/// <param name="ExpiresAt">When the proposal is forgotten.</param>
/// <param name="SerialNumber">The machine.</param>
/// <param name="DisplayName">A name for people.</param>
/// <param name="Endpoint">The endpoint and the certificate the server presented.</param>
/// <param name="Profiles">The profiles the proposal covers.</param>
/// <param name="Problems">Why the proposal was not accepted, one reason each.</param>
/// <param name="Summary">How many elements are in which state.</param>
/// <param name="Rows">Every element with the value its node gave, what needs a look first.</param>
/// <param name="Replaces">True if the machine is added already: the proposal would replace its registration.</param>
/// <param name="Changes">What would change against the stored registration.</param>
internal sealed record ProposalView(
    bool Accepted,
    string? DraftId,
    DateTimeOffset? ExpiresAt,
    string SerialNumber,
    string? DisplayName,
    EndpointView Endpoint,
    IReadOnlyList<string> Profiles,
    IReadOnlyList<string> Problems,
    MappingSummary? Summary,
    IReadOnlyList<MappingRow> Rows,
    bool Replaces,
    RegistrationChanges? Changes);

/// <summary>Builds the answers from what the adapter holds.</summary>
internal static class Views
{
    public static EndpointView Endpoint(EndpointRegistration endpoint) =>
        new(endpoint.Url, endpoint.SecurityMode, endpoint.SecurityPolicy, endpoint.ServerCertificateThumbprint);

    public static ServerView Server(MachineConnection connection) => Mapping(connection).Server;

    public static MappingView Mapping(MachineConnection connection)
    {
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
        var server = new ServerView(
            registration.SerialNumber,
            registration.DisplayName,
            Endpoint(registration.Endpoint),
            status.State,
            status.LastError,
            registration.Profiles,
            MappingReview.Summary(rows),
            status.NeedsRescan,
            registration.Discovery?.At);
        return new MappingView(server, rows);
    }

    public static EndpointRankView Ranking(string url, IReadOnlyList<RankedEndpoint> ranked) =>
        new(
            url,
            ranked.Count > 0 ? ranked[0].Endpoint.ServerCertificateThumbprint : null,
            [.. ranked.Select(one => new RankedEndpointView(one.Endpoint.SecurityMode, one.Endpoint.SecurityPolicy, one.Recommended, one.Weak))]);

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
