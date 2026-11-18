using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// The namespace <c>urn:umati2:datamodel:opcua</c>: the data model of umati published as it is, one
/// variable per element. Its node ids are the paths of the elements, <c>s=State.FeedOverride</c>,
/// and its values are in the units of the data model, so the adapter maps a machine in it by itself
/// and leaves nothing of it to the scan. Behind a gateway the namespace carries the prefix of the
/// gateway, <c>urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua</c>.
/// </summary>
internal static class Umati2DataModel
{
    /// <summary>The namespace, without the prefix of a gateway.</summary>
    public const string Namespace = "urn:umati2:datamodel:opcua";

    /// <summary>The identifier of the machine object.</summary>
    public const string MachineIdentifier = "s=Machine";

    /// <summary>The identifier of the binary encoding of <c>DataType.Status</c>.</summary>
    public const string StatusEncoding = "s=DataType.Status.DefaultBinary";

    /// <summary>The node that holds the item state and the operation mode, as one structure.</summary>
    public const string StatusIdentifier = "s=State.Status";

    /// <summary>The identifier of the binary encoding of <c>DataType.Alert</c>.</summary>
    public const string AlertEncoding = "s=DataType.Alert.DefaultBinary";

    /// <summary>The node that lists the alerts that stand, an array of <c>DataType.Alert</c>.</summary>
    public const string ActiveAlertsIdentifier = "s=Notification.ActiveAlerts";

    private const string EvidenceStart = "Known mapping of the adapter for " + Namespace + ": ";

    private static readonly IReadOnlyDictionary<string, string> ItemStates = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["0"] = "NotAvailable",
        ["1"] = "OutOfService",
        ["2"] = "NotExecuting",
        ["3"] = "Executing",
    };

    private static readonly IReadOnlyDictionary<string, string> OperationModes = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["0"] = "None",
        ["1"] = "Maintenance",
        ["2"] = "Setup",
        ["3"] = "Processing",
    };

    /// <summary>
    /// The elements the namespace gives, with the identifier of their node. Each was verified on the
    /// gateway of an edge device on 2026-11-17: the data type, the unit in the description of the node
    /// (<c>Unit: one (C62)</c>, <c>Unit: second (SEC)</c>), and the enumerations of <c>DataType.Status</c>.
    /// <c>ManufacturerUri</c>, <c>ProductCode</c> and <c>YearOfConstruction</c> were not on that
    /// gateway; they are in the core of the specification 0.17.0 and set by their path, so a server
    /// that has them delivers them, and one that has not moves them to <c>missing</c>.
    /// </summary>
    public static IReadOnlyList<ElementRegistration> Rules { get; } =
    [
        Text("Identification.Manufacturer"),
        Text("Identification.SerialNumber"),
        Text("Identification.ProductInstanceUri"),
        Text("Identification.ManufacturerUri"),
        Text("Identification.Model"),
        Text("Identification.ProductCode"),
        Year("Identification.YearOfConstruction"),
        Text("Identification.SoftwareRevision"),
        Status("State.MachineryItemState", "MachineryItemState", ItemStates),
        Status("State.MachineryOperationMode", "MachineryOperationMode", OperationModes),
        Number("State.FeedOverride", "one"),
        Number("OperationCounters.PowerOnDuration", "second"),
    ];

    /// <summary>Whether a node is in this namespace, with or without the prefix of a gateway.</summary>
    public static bool Holds(string? node) => KnownMappings.IsNamespace(KnownMappings.NamespaceOf(node), Namespace);

    /// <summary>
    /// The namespace URI, with its prefix, of the machine of a registration if that machine is in this
    /// namespace: its <c>machineNode</c>, or else the node of its serial number. Otherwise null.
    /// </summary>
    public static string? NamespaceOf(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var node = registration.MachineNode
            ?? registration.Elements.FirstOrDefault(element => element.Area == "umati" && element.Path == MachineChecks.SerialNumberPath)?.Node;
        return Holds(node) ? KnownMappings.NamespaceOf(node) : null;
    }

    /// <summary>
    /// The registration with every element of <see cref="Rules"/> set to its node in the namespace of
    /// the machine, whatever the scan proposed for it, and none of them missing. Elements no rule
    /// covers are kept. The alerts come from the list <c>Notification.ActiveAlerts</c> of the namespace,
    /// not from an alarm event type the scan named: the list is the model's own, and the conditions of
    /// the events lie in a namespace of the maker. A registration of another namespace is returned as it is.
    /// </summary>
    public static MachineRegistration Apply(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        if (NamespaceOf(registration) is not { } uri)
        {
            return registration;
        }

        var elements = registration.Elements.ToList();
        foreach (var rule in Rules)
        {
            var known = rule with { Node = $"nsu={uri};{rule.Node}" };
            var at = elements.FindIndex(element => element.Area == "umati" && element.Path == rule.Path);
            if (at >= 0)
            {
                elements[at] = known;
            }
            else
            {
                elements.Add(known);
            }
        }

        var paths = Rules.Select(rule => rule.Path).Append(Topics.ActiveAlerts).ToHashSet(StringComparer.Ordinal);
        return registration with
        {
            Elements = elements,
            Alerts = new AlertRegistration { List = $"nsu={uri};{ActiveAlertsIdentifier}" },
            Missing = [.. registration.Missing.Where(entry => !paths.Contains(entry.Path))],
        };
    }

    /// <summary>
    /// The registration without the list of alerts the rules set, moved to <c>missing</c>: the server
    /// turned out not to have the node <c>Notification.ActiveAlerts</c>. Any other registration is returned as it is.
    /// </summary>
    public static MachineRegistration WithoutAlertList(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        if (registration.Alerts?.List is not { } list || !Holds(list))
        {
            return registration;
        }

        return registration with
        {
            Alerts = null,
            Missing =
            [
                .. registration.Missing.Where(entry => entry.Path != Topics.ActiveAlerts),
                new MissingElement { Path = Topics.ActiveAlerts, Reason = $"The server has no node {ActiveAlertsIdentifier} in {Namespace}." },
            ],
        };
    }

    /// <summary>
    /// The registration without the elements a rule set and the server turned out not to have, each
    /// moved to <c>missing</c>: a server of this namespace need not fill every element.
    /// </summary>
    /// <param name="registration">The registration, with the rules applied.</param>
    /// <param name="notFound">The elements, as area and path, whose node the server does not have.</param>
    /// <param name="removed">The paths that were taken out.</param>
    public static MachineRegistration WithoutAbsent(
        MachineRegistration registration, IEnumerable<(string Area, string Path)> notFound, out IReadOnlySet<string> removed)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(notFound);
        var taken = new HashSet<string>(StringComparer.Ordinal);
        if (NamespaceOf(registration) is not null)
        {
            var paths = Rules.Select(rule => rule.Path).ToHashSet(StringComparer.Ordinal);
            foreach (var (area, path) in notFound)
            {
                if (area == "umati" && paths.Contains(path)
                    && registration.Elements.Any(element => element.Area == area && element.Path == path && Holds(element.Node)))
                {
                    taken.Add(path);
                }
            }
        }

        removed = taken;
        if (taken.Count == 0)
        {
            return registration;
        }

        var missing = registration.Elements
            .Where(element => element.Area == "umati" && taken.Contains(element.Path))
            .Select(element => new MissingElement
            {
                Path = element.Path,
                Reason = $"The server has no node {element.Node["nsu=".Length..].Split(';', 2)[1]} in {Namespace}.",
            });
        return registration with
        {
            Elements = [.. registration.Elements.Where(element => !(element.Area == "umati" && taken.Contains(element.Path)))],
            Missing = [.. registration.Missing.Where(entry => !taken.Contains(entry.Path)), .. missing],
        };
    }

    private static ElementRegistration Text(string path) => new()
    {
        Path = path,
        Kind = ValueKind.Text,
        Node = "s=" + path,
        Match = MatchKind.Direct,
        Evidence = EvidenceStart + $"the node s={path} is the element.",
    };

    private static ElementRegistration Number(string path, string unit) => new()
    {
        Path = path,
        Kind = ValueKind.Number,
        Unit = unit,
        Node = "s=" + path,
        Match = MatchKind.Direct,
        Evidence = EvidenceStart + $"the node s={path} is the element, a Double in {unit} as its description says.",
    };

    private static ElementRegistration Year(string path) => new()
    {
        Path = path,
        Kind = ValueKind.Number,
        Node = "s=" + path,
        Match = MatchKind.Direct,
        Evidence = EvidenceStart + $"the node s={path} is the element, a year of four digits, without a unit.",
    };

    private static ElementRegistration Status(string path, string field, IReadOnlyDictionary<string, string> map) => new()
    {
        Path = path,
        Kind = ValueKind.Text,
        Node = StatusIdentifier,
        Field = field,
        Map = map,
        Match = MatchKind.Direct,
        Evidence = EvidenceStart + $"the member {field} of the structure {StatusIdentifier} (DataType.Status), an enumeration of OPC 40001-1.",
    };
}
