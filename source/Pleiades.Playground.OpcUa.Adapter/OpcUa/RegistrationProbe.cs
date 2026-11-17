using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>What one element of a registration gave when its node was read once.</summary>
/// <param name="Area"><c>umati</c> or <c>vendor</c>.</param>
/// <param name="Path">The path of the element.</param>
/// <param name="Topic">The topic it would be published on.</param>
/// <param name="Node">The node.</param>
/// <param name="Status"><c>Good</c>, or what is wrong.</param>
/// <param name="NodeFound">False if the server has no such node: the registration does not fit this server.</param>
/// <param name="Raw">The value of the node as text.</param>
/// <param name="Value">The value that would be published.</param>
/// <param name="Unit">The unit of a number.</param>
internal sealed record ProbedElement(
    string Area, string Path, string Topic, string Node, string Status, bool NodeFound, string? Raw, object? Value, string? Unit);

/// <summary>The result of trying a registration against its server.</summary>
/// <param name="ServerCertificateThumbprint">The certificate the server presented.</param>
/// <param name="Namespaces">The namespaces the server has now.</param>
/// <param name="Elements">Every element with what its node gave.</param>
internal sealed record ProbeResult(
    string? ServerCertificateThumbprint, IReadOnlyList<string> Namespaces, IReadOnlyList<ProbedElement> Elements)
{
    /// <summary>The elements whose node the server does not have.</summary>
    public IReadOnlyList<ProbedElement> NotFound => [.. Elements.Where(element => !element.NodeFound)];
}

/// <summary>
/// Tries a registration against its server without storing or publishing anything: connects with
/// the security it names and reads every node once. This is how a proposed registration is checked
/// before a person says yes to it.
/// </summary>
internal sealed class RegistrationProbe
{
    private readonly OpcUaClient _client;

    /// <summary>Creates the probe.</summary>
    public RegistrationProbe(OpcUaClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
    }

    /// <summary>Connects, reads every node of the registration once and closes the session.</summary>
    public async Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var (session, thumbprint) = await _client.ConnectAsync(registration.Endpoint, cancellationToken).ConfigureAwait(false);
        await using (session.ConfigureAwait(false))
        {
            var elements = new List<ProbedElement>();
            foreach (var element in registration.Elements)
            {
                elements.Add(await ReadAsync(session, registration.SerialNumber, element, cancellationToken).ConfigureAwait(false));
            }

            var namespaces = new List<string>();
            for (uint index = 0; index < session.NamespaceUris.Count; index++)
            {
                namespaces.Add(session.NamespaceUris.GetString(index) ?? string.Empty);
            }

            return new ProbeResult(thumbprint, namespaces, elements);
        }
    }

    private static async Task<ProbedElement> ReadAsync(
        ISession session, string serialNumber, ElementRegistration element, CancellationToken cancellationToken)
    {
        var topic = Topics.Value(serialNumber, element.Area, element.Path);
        ProbedElement Result(string status, bool found, object? raw = null, ConvertedValue? value = null) =>
            new(element.Area, element.Path, topic, element.Node, status, found, raw is null ? null : ValueConverter.KeyOf(raw), value?.Boxed, element.Unit);

        if (!MachineConnection.TryResolve(session, element.Node, out var node))
        {
            return Result("NamespaceUnknown: the server has no namespace of this node.", found: false);
        }

        try
        {
            var value = await session.ReadValueAsync(node, cancellationToken).ConfigureAwait(false);
            var raw = value.WrappedValue.AsBoxedObject(Variant.BoxingBehavior.Legacy) is LocalizedText text ? text.Text : value.WrappedValue.AsBoxedObject(Variant.BoxingBehavior.Legacy);
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
