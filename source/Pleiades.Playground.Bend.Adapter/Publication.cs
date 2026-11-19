using System.Text.Json.Nodes;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Bend.Adapter;

/// <summary>One thing the machine said, for the broker below <c>machines/{MachineId}/</c>.</summary>
/// <param name="Timestamp">The time the machine gave it, UTC.</param>
internal abstract record Publication(DateTimeOffset Timestamp);

/// <summary>
/// A value of an element: a path of the model (<c>State.Status</c>) or of a signal of the manufacturer
/// (below the prefix <c>x-&lt;domain&gt;</c>, on <c>oem/</c>).
/// </summary>
/// <param name="Path">The path, every segment a level of the topic.</param>
/// <param name="Value">A JSON value, a snapshot, a list, or <see langword="null"/> for not available right now.</param>
/// <param name="Timestamp">The time the machine gave it, UTC.</param>
/// <param name="Unit">The name of the unit in the catalogue of the model, with a number.</param>
internal sealed record ValuePublication(string Path, JsonNode? Value, DateTimeOffset Timestamp, string? Unit = null)
    : Publication(Timestamp);

/// <summary>
/// An event of the group <c>Notification</c>: <c>Notification.AlertRaised</c>, <c>Notification.AlertCleared</c> or
/// <c>Notification.NotificationEvent</c>.
/// </summary>
/// <param name="Type">The path of the event in the model.</param>
/// <param name="Data">The alert or the notification, with the fields of an entry of <c>Notification.ActiveAlerts</c>.</param>
/// <param name="Timestamp">When it came up or went, UTC.</param>
internal sealed record EventPublication(string Type, JsonObject Data, DateTimeOffset Timestamp) : Publication(Timestamp);

/// <summary>The paths the adapter publishes, named by the data model 0.17.1 and the binding.</summary>
internal static class Paths
{
    /// <summary>The snapshot of <c>MachineryItemState</c> and <c>MachineryOperationMode</c>.</summary>
    public const string Status = MachineManifest.Status;

    public const string ActiveAlerts = "Notification.ActiveAlerts";

    /// <summary>
    /// The work master the machine carries out; for a machine without work masters of its own, as RCI, the name of
    /// the program (catalogue of the model).
    /// </summary>
    public const string ActiveWorkMaster = "WorkMasterMonitoring.ActiveWorkMaster";

    public const string AlertRaised = "Notification.AlertRaised";
    public const string AlertCleared = "Notification.AlertCleared";
    public const string NotificationEvent = "Notification.NotificationEvent";

    // Signals of the manufacturer, below its prefix x-<domain>: the model has no element for them.

    /// <summary>The NC program, as the simulators and the cutting adapter publish it.</summary>
    public const string ActiveProgram = "WorkMasterMonitoring.ActiveProgram";

    public const string RciOperatingState = "Rci.OperatingState";
    public const string ActiveOrder = "Production.ActiveOrderNo";
    public const string ActivePackage = "Production.ActiveProductionPackage";
    public const string ActivePart = "Production.ActivePartNo";
    public const string ProcessedParts = "Production.ProcessedParts";
    public const string DesiredParts = "Production.DesiredParts";
    public const string ScrapParts = "Production.ScrapParts";
    public const string PackageProcessed = "Production.PackageProcessedQuantity";
    public const string PackageDesired = "Production.PackageDesiredQuantity";
}

/// <summary>Puts what the machine says on the broker, as the binding of machines says.</summary>
internal interface IPublisher
{
    /// <summary>Begins: the connect sequence of the binding, once the broker is there.</summary>
    Task StartAsync();

    /// <summary>The machine is there: <c>Running</c>, after <paramref name="publications"/>.</summary>
    Task ReachedAsync(IReadOnlyList<Publication> publications);

    /// <summary>
    /// The machine said <paramref name="publications"/>, in this order. While it counts as not reached, the values
    /// are kept for the next <see cref="ReachedAsync"/>; this never reports it as reached.
    /// </summary>
    Task SaidAsync(IReadOnlyList<Publication> publications);

    /// <summary>The machine is offline: <c>CommunicationFault</c>; the values stand.</summary>
    Task LostAsync();

    /// <summary>The sign of life of the adapter, whatever the machine does.</summary>
    Task HeartbeatAsync();

    /// <summary>A clean stop: <c>Shutdown</c>, the last message.</summary>
    Task ShutdownAsync();
}
