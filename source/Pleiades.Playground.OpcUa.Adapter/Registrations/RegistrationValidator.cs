using Pleiades.Playground.OpcUa.Adapter.Mapping;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Checks a registration before it is stored: everything that can be said without a connection.
/// Whether it delivers the core of the data model is checked by <see cref="DataModelProfiles"/>.
/// </summary>
internal static class RegistrationValidator
{
    /// <summary>The problems of a registration. Empty means it can be stored.</summary>
    public static IReadOnlyList<string> Validate(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var problems = new List<string>();

        if (!Topics.IsSerialNumber(registration.SerialNumber))
        {
            problems.Add("serialNumber: must be one topic level, without '/', '+', '#' or white space.");
        }

        if (!Uri.TryCreate(registration.Endpoint.Url, UriKind.Absolute, out var url) || url.Scheme != "opc.tcp")
        {
            problems.Add("endpoint.url: must be an opc.tcp:// URL.");
        }

        if (registration.Endpoint.User is { } user
            && (string.IsNullOrWhiteSpace(user) || registration.Endpoint.SecurityMode != SecurityMode.SignAndEncrypt))
        {
            problems.Add("endpoint.user: a user logs in over an encrypted endpoint only (SignAndEncrypt), with a user name that is not empty.");
        }

        if (string.IsNullOrWhiteSpace(registration.Endpoint.SecurityPolicy))
        {
            problems.Add("endpoint.securityPolicy: is required, for example Aes256_Sha256_RsaPss.");
        }

        if (registration.MachineNode is not null && !IsPortableNode(registration.MachineNode))
        {
            problems.Add("machineNode: must carry the namespace as a URI, 'nsu=<uri>;s=<text>', as opcua_machine_list names it.");
        }

        if (registration.Elements.Count == 0)
        {
            problems.Add("elements: at least one element is required.");
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var element in registration.Elements)
        {
            Check(element, seen, problems);
        }

        if (registration.Alerts is { } alerts)
        {
            if (alerts.List is not null)
            {
                if (!IsPortableNode(alerts.List))
                {
                    problems.Add("alerts.list: must be a node with a namespace URI, 'nsu=<uri>;s=<text>'.");
                }

                if (!string.IsNullOrEmpty(alerts.EventType))
                {
                    problems.Add("alerts: the alerts come from the list or from the events of an alarm type, not from both; leave eventType out with list.");
                }
            }
            else if (!IsPortableNode(alerts.EventType))
            {
                problems.Add("alerts.eventType: must be a node with a namespace URI, 'nsu=<uri>;i=<number>', or a node of namespace 0.");
            }

            if (alerts.Notifier is { Length: > 0 } notifier && !IsPortableNode(notifier))
            {
                problems.Add("alerts.notifier: must be a node with a namespace URI, or a node of namespace 0.");
            }
        }

        return problems;
    }

    /// <summary>
    /// A node id that stays the same when the server restarts: namespace 0 (<c>i=2253</c>) or one
    /// with the namespace as a URI (<c>nsu=...;</c>). <c>ns=2;...</c> is an index and may move.
    /// </summary>
    public static bool IsPortableNode(string? node)
    {
        if (string.IsNullOrWhiteSpace(node))
        {
            return false;
        }

        var identifier = node;
        if (node.StartsWith("nsu=", StringComparison.Ordinal))
        {
            // The identifier follows the first ';': a namespace URI holds none.
            var separator = node.IndexOf(';', StringComparison.Ordinal);
            if (separator <= "nsu=".Length)
            {
                return false;
            }

            identifier = node[(separator + 1)..];
        }

        // "i=42", "s=name", "g=...", "b=...". An index form, "ns=2;i=42", fails here on its second character.
        return identifier.Length > 2 && identifier[1] == '=' && "isgb".Contains(identifier[0], StringComparison.Ordinal);
    }

    private static void Check(ElementRegistration element, HashSet<string> seen, List<string> problems)
    {
        var name = $"elements[{element.Area}/{element.Path}]";
        if (element.Area is not (Topics.ModelArea or Topics.OemArea))
        {
            problems.Add($"{name}: area must be 'umati' or 'oem'.");
        }

        if (!Topics.IsPath(element.Path))
        {
            problems.Add($"{name}: path must be 'Group.Element', with instance keys in brackets.");
        }
        else if (element.Path is Topics.ConnectionState or Topics.ConnectionHeartbeat)
        {
            problems.Add($"{name}: the adapter publishes the connection itself; it is not an element of a registration.");
        }

        if (!seen.Add($"{element.Area}/{element.Path}"))
        {
            problems.Add($"{name}: is named twice.");
        }

        if (!IsPortableNode(element.Node))
        {
            problems.Add($"{name}: node must carry the namespace as a URI, 'nsu=<uri>;i=<number>' or 'nsu=<uri>;s=<text>', not an index.");
        }

        if (element.Field is { } field && string.IsNullOrWhiteSpace(field))
        {
            problems.Add($"{name}: field names the member of a structure; leave it out for a node that is the element itself.");
        }

        if (element.Path is Topics.ActiveAlerts)
        {
            problems.Add($"{name}: the adapter publishes the alerts from 'alerts', the events of an alarm type or, for a machine in urn:umati2:datamodel:opcua, this list, which it sets itself; it is not an element of a registration.");
        }

        if (element.Kind == ValueKind.Number)
        {
            var catalogue = element.Area == Topics.ModelArea ? CatalogueUnits.Of(element.Path) : null;
            if (element.Area == Topics.ModelArea && CatalogueUnits.WithoutUnit.Contains(element.Path))
            {
                if (element.Unit is not null)
                {
                    problems.Add($"{name}: this element of the data model has no unit; leave unit out.");
                }
            }
            else if (catalogue is not null && element.Unit != catalogue)
            {
                problems.Add($"{name}: the data model gives this element the unit '{catalogue}'; set unit '{catalogue}' and convert with scale (for example 1000 from kilowatt hours to wattHour).");
            }
            else if (catalogue is null && !CatalogueUnits.IsKnown(element.Unit))
            {
                problems.Add($"{name}: a number needs a unit of the catalogue of the data model: {string.Join(", ", CatalogueUnits.Known.Keys)}.");
            }

            if (element.Map is not null)
            {
                problems.Add($"{name}: a number has no map; use scale and offset.");
            }
        }
        else if (element.Unit is not null || element.Scale is not null || element.Offset is not null)
        {
            problems.Add($"{name}: unit, scale and offset belong to a number only.");
        }
    }
}
