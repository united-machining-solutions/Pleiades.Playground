using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.OpcUa.Adapter.Api;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.McpTools;

/// <summary>
/// The tools of the adapter itself: which OPC UA servers are added, how well each is mapped, and
/// proposing a registration. None of them adds or removes a machine. That takes a request to the
/// management API, which a person's click sends.
/// </summary>
[McpServerToolType]
[System.Diagnostics.CodeAnalysis.SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated by the MCP server")]
internal sealed class DiscoveryTools(MachineSupervisor supervisor)
{
    [McpServerTool(Name = "opcua_server_list", ReadOnly = true),
     Description(
         "List the OPC UA servers that are added to the platform: serial number of the machine, endpoint address, " +
         "security of the session, connection state, profiles of the data model, and how many elements are mapped " +
         "without doubt (ok), derived, unclear, mismatched or missing. Use it for 'which OPC UA machines are there'.")]
    public ServerListView ListServers() => new([.. supervisor.Machines.Select(Views.Server)]);

    [McpServerTool(Name = "opcua_mapping_show", ReadOnly = true),
     Description(
         "Show the mapping of one added OPC UA server, element by element: which node feeds which element of the " +
         "data model, its last value, and its state. Mismatch: the node is gone or its value does not fit. Unclear: " +
         "the match is a guess or the node gives no value. Derived: computed from another signal. Missing: the " +
         "server does not offer the element. What needs a look comes first.")]
    public MappingView ShowMapping(
        [Description("Serial number of the machine, as opcua_server_list names it.")] string serialNumber) =>
        supervisor.Find(serialNumber) is { } connection
            ? Views.Mapping(connection)
            : throw new McpException(
                $"No machine '{serialNumber}' is added. Added: {string.Join(", ", supervisor.Machines.Select(one => one.Registration.SerialNumber).DefaultIfEmpty("none"))}.");

    [McpServerTool(Name = "opcua_endpoint_rank", ReadOnly = true, OpenWorld = true),
     Description(
         "Ask an OPC UA server for its endpoints and order them from strongest to weakest security. The first one, " +
         "marked recommended, is the one a registration must name. Also returns the thumbprint of the certificate " +
         "the server presents. Call it first when a person names a server address. A machine named without an " +
         "address has the default endpoint opc.tcp://<machine>:4840; if that does not answer, ask the person for the endpoint.")]
    public async Task<EndpointRankView> RankEndpoints(
        [Description("Address of the server, for example opc.tcp://192.168.1.20:4840, or opc.tcp://<machine>:4840 for a machine named without an address.")] string url,
        CancellationToken cancellationToken = default)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != "opc.tcp")
        {
            throw new McpException("url must be an opc.tcp:// address, for example opc.tcp://192.168.1.20:4840.");
        }

        try
        {
            return Views.Ranking(url, await supervisor.RankEndpointsAsync(url, cancellationToken).ConfigureAwait(false));
        }
        catch (Exception exception) when (MachineEndpoints.IsServerFault(exception))
        {
            // Said for the model: a default it assumed is not to be replaced by a guess of its own.
            throw new McpException(
                $"The server at {url} did not answer: {exception.Message} " +
                "If this address was assumed from a machine name, ask the person for the endpoint (opc.tcp://host:port); do not guess another one.",
                exception);
        }
    }

    // Read-only for the platform and for the machine: the proposal is kept in memory for half an
    // hour, nothing is stored and nothing is published. Adding the machine is a person's click.
    [McpServerTool(Name = "opcua_registration_propose", ReadOnly = true, OpenWorld = true),
     Description(
         "Propose the registration of an OPC UA server after a scan. The adapter checks the registration, connects " +
         "with the named security, reads every node once and converts its value. It does NOT add the machine: it " +
         "returns a proposal with a draftId that a person confirms with a click. If accepted is false, read " +
         "problems, correct the registration and propose again. For a machine that is added already the result " +
         "says what would change (changes). Read opcua_get_skill_guide before the first proposal.")]
    public async Task<ProposalView> Propose(
        [Description("The registration: endpoint, profiles, one element per value, alerts, and what is missing.")] MachineRegistration registration,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(registration);
        try
        {
            return await supervisor.ProposeAsync(registration, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (MachineEndpoints.IsServerFault(exception))
        {
            throw new McpException($"The server at {registration.Endpoint.Url} could not be used: {exception.Message}", exception);
        }
    }
}
