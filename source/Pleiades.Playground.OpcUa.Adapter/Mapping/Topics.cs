using System.Text.RegularExpressions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// Between the paths of a registration and the paths of the MQTT binding of machines
/// (<c>contracts/mqtt</c>, "Machines: the binding of the data model"). A registration names an element as a
/// scan finds it: an instance in brackets (<c>Channel[1].ChannelState</c>), the two fields of the state as
/// elements of their own (<c>State.MachineryItemState</c>), a signal of the maker in the area <c>oem</c>. The
/// binding names it as the data model does: <c>Channel.1.ChannelState</c>, the snapshot <c>State.Status</c>, and
/// <c>x-&lt;domain&gt;.&lt;path&gt;</c> for a signal of the manufacturer. This is the one place that translates.
/// </summary>
internal static partial class Topics
{
    /// <summary>The area of a registration for an element of the data model.</summary>
    public const string ModelArea = "umati";

    /// <summary>The area of a registration for a signal of the maker, as the namespace level of the binding.</summary>
    public const string OemArea = "oem";

    /// <summary>The earlier name of <see cref="OemArea"/>; a registration that still says it is moved over.</summary>
    public const string FormerOemArea = "vendor";

    /// <summary>The state of the connection between adapter and machine.</summary>
    public const string ConnectionState = MachineBinding.ConnectionState;

    /// <summary>The sign of life of the adapter.</summary>
    public const string ConnectionHeartbeat = MachineBinding.Heartbeat;

    /// <summary>The snapshot of the state, <c>{MachineryItemState, MachineryOperationMode}</c>.</summary>
    public const string Status = MachineManifest.Status;

    /// <summary>The list of the alerts that stand.</summary>
    public const string ActiveAlerts = "Notification.ActiveAlerts";

    /// <summary>
    /// The fields of <c>State.Status</c> by the path a registration gives them: each is an element of the
    /// registration, and together they are one value of the binding.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> StatusFields = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["State.MachineryItemState"] = "MachineryItemState",
        ["State.MachineryOperationMode"] = "MachineryOperationMode",
    };

    /// <summary>
    /// The elements of the identification the binding forms the machine id and the source of every event from.
    /// The adapter publishes them from the identity of the registration, not from their nodes.
    /// </summary>
    public static readonly IReadOnlySet<string> Identity = new HashSet<string>(StringComparer.Ordinal)
    {
        MachineManifest.Manufacturer, MachineManifest.SerialNumber, MachineManifest.ProductInstanceUri,
        MachineManifest.ManufacturerUri, MachineManifest.Model,
    };

    /// <summary>
    /// Paths a registration names that the data model 0.17.1 names otherwise. The model has no active program; it
    /// has the active work master, which on a machine without work masters of its own is the name of its program
    /// (the binding, "Open for the hackathon").
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> Renamed = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["Production.ActiveProgram"] = "WorkMasterMonitoring.ActiveWorkMaster",
    };

    /// <summary>
    /// Paths a registration names that are no element of the data model 0.17.1: they go out as signals of the
    /// manufacturer, since an element of the model never lies outside <c>umati</c> and nothing else inside it. The
    /// model lists the software revisions in <c>Components.Software</c>, which the adapter does not build.
    /// </summary>
    public static readonly IReadOnlySet<string> NotInModel = new HashSet<string>(StringComparer.Ordinal)
    {
        "Identification.SoftwareRevision",
    };

    /// <summary>A serial number is one topic level: no <c>/</c>, <c>+</c>, <c>#</c> and no white space.</summary>
    public static bool IsSerialNumber(string? value) => value is not null && SerialNumber().IsMatch(value);

    /// <summary>
    /// A path is <c>Group.Element</c> with optional instance keys, for example
    /// <c>Consumption.Electricity[Main].AcActivePowerTotal</c>.
    /// </summary>
    public static bool IsPath(string? value) => value is not null && Path().IsMatch(value);

    /// <summary>
    /// The path of the binding for an element of a registration: every instance key a segment of its own, the
    /// fields of the state the snapshot <c>State.Status</c>, a signal of the maker below the prefix of its
    /// manufacturer (<paramref name="extensionPrefix"/>, <c>x-&lt;domain&gt;</c>).
    /// </summary>
    public static string BindingPath(string area, string path, string extensionPrefix)
    {
        ArgumentNullException.ThrowIfNull(path);
        var dotted = path.Replace("[", ".", StringComparison.Ordinal).Replace("]", string.Empty, StringComparison.Ordinal);
        if (area is OemArea or FormerOemArea || NotInModel.Contains(path))
        {
            return $"{extensionPrefix}.{dotted}";
        }

        if (Renamed.TryGetValue(path, out var renamed))
        {
            return renamed;
        }

        return StatusFields.ContainsKey(path) ? Status : dotted;
    }

    [GeneratedRegex(@"^[^/+#\s]+$")]
    private static partial Regex SerialNumber();

    [GeneratedRegex(@"^[A-Za-z0-9]+(\[[A-Za-z0-9]+\])?(\.[A-Za-z0-9]+(\[[A-Za-z0-9]+\])?)+$")]
    private static partial Regex Path();
}
