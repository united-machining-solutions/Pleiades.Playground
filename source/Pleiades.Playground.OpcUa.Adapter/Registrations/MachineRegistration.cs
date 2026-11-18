using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Everything the adapter needs to run one machine: where its OPC UA server is, how to connect,
/// and which node feeds which element of the data model. A discovery writes it once; the adapter
/// runs from it alone after every restart.
/// </summary>
internal sealed record MachineRegistration
{
    /// <summary>Version of this document, for later migrations.</summary>
    public int SchemaVersion { get; init; } = CurrentSchemaVersion;

    /// <summary>
    /// The version this adapter writes. 2: numbers in the units of the catalogue of the data model (energy in
    /// <c>wattHour</c>, no longer <c>joule</c>), and the identity of the machine.
    /// </summary>
    public const int CurrentSchemaVersion = 2;

    /// <summary>
    /// The value of <c>Identification.SerialNumber</c>: how the adapter and its API name the machine. On the broker
    /// the machine is named by its machine id (<see cref="Identity"/>), of which the serial number is a part.
    /// </summary>
    [Description("The value of Identification.SerialNumber of the machine: one word without /, +, # or white space.")]
    public string SerialNumber { get; init; } = string.Empty;

    /// <summary>A name for people, shown in lists.</summary>
    public string? DisplayName { get; init; }

    /// <summary>The version of the data model the elements were matched against.</summary>
    public string? ModelVersion { get; init; }

    /// <summary>
    /// The profiles of the data model the elements deliver whole, for example <c>Core</c>. The adapter
    /// sets it from the elements (<see cref="Mapping.DataModelProfiles"/>); what a proposal names is replaced.
    /// </summary>
    [Description("Leave out. The adapter names the profiles whose elements are all mapped: Core, IdentificationExtended, MonitoringExtended, ChannelMonitoring, Spindle, EnergyElectricity.")]
    public IReadOnlyList<string> Profiles { get; init; } = [];

    /// <summary>The server and the security it is reached with.</summary>
    public EndpointRegistration Endpoint { get; init; } = new();

    /// <summary>
    /// The object of this machine on its server, with the namespace as a URI. Required when the
    /// server serves several machines, an aggregation server for example: it says which of them
    /// this registration is. Machines on one endpoint share one session.
    /// </summary>
    [Description("The object of the machine on the server, as opcua_machine_list names it (node). Required if the server serves several machines; leave it out for a server of one machine.")]
    public string? MachineNode { get; init; }

    /// <summary>
    /// Who the machine is, as the values of its identification said when it was added: the machine id of every
    /// topic and the source of every event follow from it. The adapter fills it in, from the nodes it read.
    /// </summary>
    [Description("Leave out. The adapter fills it in from the values of the identification when the machine is added.")]
    public IdentityRegistration? Identity { get; init; }

    /// <summary>One entry per value the adapter publishes.</summary>
    public IReadOnlyList<ElementRegistration> Elements { get; init; } = [];

    /// <summary>Where alarms come from. Without it no notification is published.</summary>
    public AlertRegistration? Alerts { get; init; }

    /// <summary>Elements the discovery looked for and did not find, each with the reason.</summary>
    public IReadOnlyList<MissingElement> Missing { get; init; } = [];

    /// <summary>Who matched the nodes, and when.</summary>
    public DiscoveryRecord? Discovery { get; init; }
}

/// <summary>
/// The identification of a machine as it was read: what the binding forms the machine id from
/// (<c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>) and what every event names as its source. Kept, so
/// that the machine keeps its topics whatever its server says later, and can be deleted when it does not answer.
/// </summary>
internal sealed record IdentityRegistration
{
    /// <summary><c>Identification.Manufacturer</c>, the name of the manufacturer.</summary>
    public string Manufacturer { get; init; } = string.Empty;

    /// <summary><c>Identification.ManufacturerUri</c>, the web address of the manufacturer.</summary>
    public string ManufacturerUri { get; init; } = string.Empty;

    /// <summary><c>Identification.Model</c>.</summary>
    public string Model { get; init; } = string.Empty;

    /// <summary><c>Identification.ProductInstanceUri</c>, the globally unique id of the machine.</summary>
    public string ProductInstanceUri { get; init; } = string.Empty;

    /// <summary>The machine id of the binding, the level below <c>machines/</c> of every topic. Written for people; read from the other fields.</summary>
    public string? MachineId { get; init; }
}

/// <summary>The endpoint of the server and the security the adapter connects with.</summary>
internal sealed record EndpointRegistration
{
    /// <summary>The URL the adapter reaches the server at, for example <c>opc.tcp://host:4840</c>.</summary>
    [Description("The opc.tcp:// address the server was reached at.")]
    public string Url { get; init; } = string.Empty;

    /// <summary>The message security mode.</summary>
    public SecurityMode SecurityMode { get; init; } = SecurityMode.SignAndEncrypt;

    /// <summary>The short name of the security policy, for example <c>Aes256_Sha256_RsaPss</c>.</summary>
    [Description("Short name of the security policy of the strongest endpoint, for example Aes256_Sha256_RsaPss.")]
    public string SecurityPolicy { get; init; } = "Aes256_Sha256_RsaPss";

    /// <summary>
    /// SHA-1 thumbprint of the server certificate the registration was made with. The adapter fills
    /// it in at the first connect and refuses a server that presents another one later.
    /// </summary>
    public string? ServerCertificateThumbprint { get; init; }

    /// <summary>
    /// The user name of the session, if the server wants a user. The password is not here: it is in
    /// the credential store, where a person put it. Null for a session without a user.
    /// </summary>
    [Description("Leave out. The adapter fills it in when a person stored a user for this server.")]
    public string? User { get; init; }

    /// <summary>
    /// Must be true to register an endpoint that is not the strongest one the server offers, or one
    /// without encryption. A decision of a person, never a default.
    /// </summary>
    [Description("Leave false. Only a person may decide for a weaker endpoint.")]
    public bool AllowWeaker { get; init; }
}

/// <summary>The message security modes of OPC UA.</summary>
internal enum SecurityMode
{
    /// <summary>No signing, no encryption.</summary>
    None = 0,

    /// <summary>Messages are signed.</summary>
    Sign = 1,

    /// <summary>Messages are signed and encrypted.</summary>
    SignAndEncrypt = 2,
}

/// <summary>How sure the match of a node to an element is.</summary>
internal enum MatchKind
{
    /// <summary>The node is the element.</summary>
    Direct = 0,

    /// <summary>The element is computed from another signal of the server.</summary>
    Derived = 1,

    /// <summary>The match is a guess: a person has to look at it.</summary>
    Unclear = 2,
}

/// <summary>What kind of value an element is on the broker.</summary>
internal enum ValueKind
{
    /// <summary>A number, with the unit of the catalogue of the data model.</summary>
    Number = 0,

    /// <summary>A text, such as a state.</summary>
    Text = 1,

    /// <summary>True or false.</summary>
    Boolean = 2,
}

/// <summary>One value: the element of the data model, the node it comes from and how it is converted.</summary>
internal sealed record ElementRegistration
{
    /// <summary>
    /// The path of the element as the MQTT binding names it, for example
    /// <c>Channel[1].ChannelState</c> or <c>State.MachineryItemState</c>.
    /// </summary>
    [Description("Path of the element as the MQTT binding names it: State.MachineryItemState, Channel[1].ChannelState, Consumption.Electricity[Main].AcActivePowerTotal.")]
    public string Path { get; init; } = string.Empty;

    /// <summary><c>umati</c> for a value the data model names, <c>oem</c> for a signal of the maker.</summary>
    [Description("umati for an element of the data model, oem for a value of the maker (a signal of the manufacturer).")]
    public string Area { get; init; } = "umati";

    /// <summary>The kind of value that is published.</summary>
    public ValueKind Kind { get; init; }

    /// <summary>
    /// The unit of a number, by the names of the catalogue of the data model, for example <c>second</c>. An element
    /// of the model has the unit of its catalogue: energy in <c>wattHour</c>, a percentage as a fraction in <c>one</c>.
    /// </summary>
    [Description("For a number: the unit of the catalogue of the data model. An element of the model has its own: one for a ratio or a percentage, second, piece, watt, wattHour for energy. A value of the maker takes one of one, second, piece, metre, kilogram, watt, wattHour, volt, ampere, hertz, pascal, newton, degreeCelsius, metrePerSecond.")]
    public string? Unit { get; init; }

    /// <summary>
    /// The node, with the namespace as a URI: <c>nsu=http://example.com/;i=42</c>. A namespace
    /// index is not accepted, because it may change when the server restarts.
    /// </summary>
    [Description("The node with its namespace as a URI, never as an index: nsu=http://example.com/;i=42 or nsu=http://example.com/;s=Name. Take the URI from the namespace array of the server (i=2255).")]
    public string Node { get; init; } = string.Empty;

    /// <summary>
    /// The member of a structure the node holds, for a structure the adapter knows how to decode, for
    /// example <c>MachineryItemState</c> of <c>DataType.Status</c> of <c>urn:umati2:datamodel:opcua</c>.
    /// Null for a node whose value is the element itself.
    /// </summary>
    [Description("Leave out. The adapter sets it for a node that is a structure it knows; you cannot read the member of a structure.")]
    public string? Field { get; init; }

    /// <summary>A number is multiplied by this before it is published, for example 0.01 for percent.</summary>
    [Description("A number is multiplied by this to reach its unit: 0.01 for percent, 3600 for hours, 0.001 for milliseconds, 1000 for kilowatt to watt, 1000 for kilowatt hours to wattHour.")]
    public double? Scale { get; init; }

    /// <summary>Added to a number after scaling.</summary>
    public double? Offset { get; init; }

    /// <summary>Raw value to published text, for an enumeration or a derived state.</summary>
    [Description("Raw value as text to the published text, for an enumeration (0 to Active) or a derived state.")]
    public IReadOnlyDictionary<string, string>? Map { get; init; }

    /// <summary>The text for a raw value the map does not name. Without it such a value is not published.</summary>
    [Description("The text for every raw value the map does not name. Without it such a value is not published.")]
    public string? MapDefault { get; init; }

    /// <summary>
    /// How sure the match is. A person who reviews a registration looks at everything that is not
    /// <see cref="MatchKind.Direct"/> first.
    /// </summary>
    [Description("Direct: the node is the element, by a Companion Specification or beyond doubt. Derived: the element is computed from another signal, say how in evidence. Unclear: several candidates or a meaning that is not certain, say what is unclear in evidence.")]
    public MatchKind Match { get; init; }

    /// <summary>Why this node was matched, in a sentence. Kept for the person who reviews the registration.</summary>
    [Description("One sentence for the person who reviews: the browse path of the node, its unit or enumeration, and why it is this element.")]
    public string? Evidence { get; init; }
}

/// <summary>Where the alarms of the machine come from.</summary>
internal sealed record AlertRegistration
{
    /// <summary>The object whose events are subscribed. The Server object if empty.</summary>
    public string? Notifier { get; init; }

    /// <summary>The event type of an alarm, with the namespace as a URI. Other events are ignored.</summary>
    [Description("The event type of an alarm of the server, with its namespace as a URI.")]
    public string EventType { get; init; } = string.Empty;

    /// <summary>
    /// The field of the event type that holds the code of the maker, as
    /// <c>nsu=http://example.com/;BrowseName</c>. Without it the name of the condition is the code.
    /// </summary>
    [Description("The field of the event type with the code of the maker, as nsu=<uri>;BrowseName.")]
    public string? CodeField { get; init; }
}

/// <summary>An element of a profile that the server does not offer.</summary>
internal sealed record MissingElement
{
    /// <summary>The path of the element.</summary>
    public string Path { get; init; } = string.Empty;

    /// <summary>Why nothing was matched.</summary>
    public string Reason { get; init; } = string.Empty;
}

/// <summary>Who matched the nodes of a registration, and when.</summary>
internal sealed record DiscoveryRecord
{
    /// <summary>The tool or person, for example <c>opcua-mcp 2.0.2</c>.</summary>
    public string By { get; init; } = string.Empty;

    /// <summary>When the server was last scanned.</summary>
    public DateTimeOffset? At { get; init; }

    /// <summary>The namespaces the server had at that time. A change is a reason to scan again.</summary>
    public IReadOnlyList<string> Namespaces { get; init; } = [];
}

/// <summary>The JSON form of a registration, in files and over HTTP.</summary>
internal static class RegistrationJson
{
    /// <summary>Lower camel case, enumerations as names, indented.</summary>
    public static JsonSerializerOptions Options { get; } = Create();

    private static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
