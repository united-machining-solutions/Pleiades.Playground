using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>What one element of a registration gave when its node was read once.</summary>
/// <param name="Area"><c>umati</c> or <c>oem</c>.</param>
/// <param name="Path">The path of the element.</param>
/// <param name="Node">The node.</param>
/// <param name="Status"><c>Good</c>, or what is wrong.</param>
/// <param name="NodeFound">False if the server has no such node: the registration does not fit this server.</param>
/// <param name="Raw">The value of the node as text.</param>
/// <param name="Value">The value that would be published.</param>
/// <param name="Unit">The unit of a number.</param>
internal sealed record ProbedElement(
    string Area, string Path, string Node, string Status, bool NodeFound, string? Raw, object? Value, string? Unit);

/// <summary>The result of trying a registration against its server.</summary>
/// <param name="ServerCertificateThumbprint">The certificate the server presented.</param>
/// <param name="Namespaces">The namespaces the server has now.</param>
/// <param name="Elements">Every element with what its node gave.</param>
/// <param name="Machines">The machines the server serves: one, or several behind an aggregation server.</param>
internal sealed record ProbeResult(
    string? ServerCertificateThumbprint,
    IReadOnlyList<string> Namespaces,
    IReadOnlyList<ProbedElement> Elements,
    IReadOnlyList<FoundMachine> Machines)
{
    /// <summary>The value of the element <c>Identification.SerialNumber</c>, if it was read.</summary>
    public string? SerialNumber =>
        Elements.FirstOrDefault(element => element.Area == "umati" && element.Path == MachineChecks.SerialNumberPath)?.Raw;

    /// <summary>The value an element of the model gave, as text, or null if it gave none.</summary>
    public string? ValueOf(string path) =>
        Elements.FirstOrDefault(element => element.Area == Topics.ModelArea && element.Path == path && element.Value is not null) is { } found
            ? ValueConverter.KeyOf(found.Value!)
            : null;

    /// <summary>The elements whose node the server does not have.</summary>
    public IReadOnlyList<ProbedElement> NotFound => [.. Elements.Where(element => !element.NodeFound)];

    /// <summary>False if the registration lists its alerts in a variable (<c>alerts.list</c>) the server does not have.</summary>
    public bool AlertListFound { get; init; } = true;

    /// <summary>
    /// False if the registration takes its alerts from the events of a type (<c>alerts.eventType</c>) the server
    /// does not have: its namespace is unknown, or the server has no such node.
    /// </summary>
    public bool AlertEventTypeFound { get; init; } = true;
}

/// <summary>Tries a registration against its server without storing or publishing anything.</summary>
internal interface IRegistrationProbe
{
    /// <summary>Connects, reads every node of the registration once and closes the session.</summary>
    Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken);
}

/// <summary>
/// Tries a registration against its server without storing or publishing anything: connects with
/// the security it names and reads every node once. This is how a proposed registration is checked
/// before a person says yes to it.
/// </summary>
internal sealed class RegistrationProbe : IRegistrationProbe
{
    private readonly OpcUaClient _client;

    /// <summary>Creates the probe.</summary>
    public RegistrationProbe(OpcUaClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
    }

    /// <inheritdoc />
    public async Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var (session, thumbprint) = await _client.ConnectAsync(registration.Endpoint, cancellationToken).ConfigureAwait(false);
        await using (session.ConfigureAwait(false))
        {
            var elements = new List<ProbedElement>();
            foreach (var element in registration.Elements)
            {
                elements.Add(await ReadAsync(session, element, cancellationToken).ConfigureAwait(false));
            }

            var namespaces = new List<string>();
            for (uint index = 0; index < session.NamespaceUris.Count; index++)
            {
                namespaces.Add(session.NamespaceUris.GetString(index) ?? string.Empty);
            }

            IReadOnlyList<FoundMachine> machines;
            try
            {
                machines = await MachineFinder.FindAsync(new UaAddressSpace(session), cancellationToken).ConfigureAwait(false);
            }
            catch (ServiceResultException)
            {
                // A server that does not let itself be browsed is taken as a server of one machine.
                machines = [];
            }

            var listFound = registration.Alerts?.List is not { } list
                || await FoundAsync(session, list, cancellationToken).ConfigureAwait(false);
            var eventTypeFound = registration.Alerts?.EventType is not { Length: > 0 } eventType
                || await TypeFoundAsync(session, eventType, cancellationToken).ConfigureAwait(false);
            return new ProbeResult(thumbprint, namespaces, elements, machines)
            {
                AlertListFound = listFound,
                AlertEventTypeFound = eventTypeFound,
            };
        }
    }

    /// <summary>Whether the server has a node: a read that answers is enough, whatever the value.</summary>
    private static async Task<bool> FoundAsync(ManagedSession session, string text, CancellationToken cancellationToken)
    {
        if (!MachineConnection.TryResolve(session, text, out var node))
        {
            return false;
        }

        try
        {
            await session.ReadValueAsync(node, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (ServiceResultException exception)
        {
            return exception.StatusCode != StatusCodes.BadNodeIdUnknown && exception.StatusCode != StatusCodes.BadNodeIdInvalid;
        }
    }

    /// <summary>
    /// Whether the server has the node of a type: its BrowseName is read, since a type has no value. Only a
    /// server that says it does not know the node, or a namespace it does not have, counts as not found.
    /// </summary>
    private static async Task<bool> TypeFoundAsync(ManagedSession session, string text, CancellationToken cancellationToken)
    {
        if (!MachineConnection.TryResolve(session, text, out var node))
        {
            return false;
        }

        try
        {
            ArrayOf<ReadValueId> toRead = new[] { new ReadValueId { NodeId = node, AttributeId = Attributes.BrowseName } };
            var response = await session.ReadAsync(null, 0, TimestampsToReturn.Neither, toRead, cancellationToken).ConfigureAwait(false);
            var status = response.Results.Count > 0 ? response.Results[0].StatusCode : StatusCodes.Good;
            return status != StatusCodes.BadNodeIdUnknown && status != StatusCodes.BadNodeIdInvalid;
        }
        catch (ServiceResultException exception)
        {
            return exception.StatusCode != StatusCodes.BadNodeIdUnknown && exception.StatusCode != StatusCodes.BadNodeIdInvalid;
        }
    }

    private static async Task<ProbedElement> ReadAsync(
        ISession session, ElementRegistration element, CancellationToken cancellationToken)
    {
        ProbedElement Result(string status, bool found, object? raw = null, ConvertedValue? value = null) =>
            new(element.Area, element.Path, element.Node, status, found, raw is null ? null : ValueConverter.KeyOf(raw), value?.Boxed, element.Unit);

        if (!MachineConnection.TryResolve(session, element.Node, out var node))
        {
            return Result("NamespaceUnknown: the server has no namespace of this node.", found: false);
        }

        try
        {
            var value = await session.ReadValueAsync(node, cancellationToken).ConfigureAwait(false);
            var raw = RawValues.Of(value.WrappedValue, session.NamespaceUris);
            var converted = ValueConverter.Convert(element, raw);
            return Result(converted is null ? "NotConvertible: the value does not fit the kind or the map of the element." : "Good", found: true, raw, converted);
        }
        catch (ServiceResultException exception)
        {
            // A node that is there and has no value yet is found; one the server does not know is not.
            var missing = exception.StatusCode == StatusCodes.BadNodeIdUnknown || exception.StatusCode == StatusCodes.BadNodeIdInvalid;
            return Result(exception.Message, found: !missing);
        }
    }
}
