namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// The namespaces a machine owns on its server. An aggregation server gives the instance nodes of
/// every machine namespaces of their own; the types it shares stay in common namespaces.
/// </summary>
internal static class MachineNamespaces
{
    /// <summary>The namespace of OPC UA itself, which no machine owns.</summary>
    public const string Base = "http://opcfoundation.org/UA/";

    /// <summary>
    /// The namespaces of the nodes of a registration: its elements and its machine node. The event
    /// type of its alarms is left out, as a type is shared by every machine of its kind, except the
    /// TRUMPF interface (<see cref="Mapping.TrumpfAlarms"/>): the conditions of a TRUMPF machine lie in it,
    /// and behind a gateway it carries the prefix of this machine.
    /// </summary>
    public static IReadOnlySet<string> Of(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var namespaces = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in registration.Elements.Select(element => element.Node).Append(registration.MachineNode))
        {
            if (UriOf(node) is { } uri && uri != Base)
            {
                namespaces.Add(uri);
            }
        }

        if (UriOf(registration.Alerts?.EventType) is { } eventType && Mapping.TrumpfAlarms.IsInterfaces(eventType))
        {
            namespaces.Add(eventType);
        }

        return namespaces;
    }

    /// <summary>The namespace URI of a node written <c>nsu=&lt;uri&gt;;i=42</c>, or null for another form.</summary>
    public static string? UriOf(string? node)
    {
        if (node is null || !node.StartsWith("nsu=", StringComparison.Ordinal))
        {
            return null;
        }

        var separator = node.IndexOf(';', StringComparison.Ordinal);
        return separator > "nsu=".Length ? node["nsu=".Length..separator] : null;
    }
}
