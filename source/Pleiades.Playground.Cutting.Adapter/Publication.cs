using System.Text.Json.Nodes;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>One thing the machine said, for the broker below <c>machines/{MachineId}/</c>.</summary>
/// <param name="Timestamp">The time the machine gave it, UTC.</param>
internal abstract record Publication(DateTimeOffset Timestamp);

/// <summary>
/// A value of an element: a path of the model (<c>State.Status</c>) or of a signal of the manufacturer
/// (<see cref="Paths.ActiveProgram"/>, below the prefix <c>x-&lt;domain&gt;</c>).
/// </summary>
/// <param name="Path">The path, every segment a level of the topic.</param>
/// <param name="Value">A JSON value, a snapshot, a list, or <see langword="null"/> for not available right now.</param>
/// <param name="Timestamp">The time the machine gave it, UTC.</param>
/// <param name="Unit">The name of the unit in the catalogue of the model, with a number.</param>
internal sealed record ValuePublication(string Path, JsonNode? Value, DateTimeOffset Timestamp, string? Unit = null)
    : Publication(Timestamp);

/// <summary>An alert event, <c>Notification.AlertRaised</c> or <c>Notification.AlertCleared</c>.</summary>
/// <param name="Type">The path of the event in the model.</param>
/// <param name="Alert">The alert, with the fields of an entry of <c>Notification.ActiveAlerts</c>.</param>
/// <param name="Timestamp">When it came up or went, UTC.</param>
internal sealed record AlertPublication(string Type, JsonObject Alert, DateTimeOffset Timestamp) : Publication(Timestamp);

/// <summary>The paths the adapter publishes, named by the data model 0.17.1 and the binding.</summary>
internal static class Paths
{
    /// <summary>The snapshot of <c>MachineryItemState</c> and <c>MachineryOperationMode</c>.</summary>
    public const string Status = MachineManifest.Status;

    public const string FeedOverride = "State.FeedOverride";
    public const string ChannelState = "Channel.1.ChannelState";
    public const string ActiveAlerts = "Notification.ActiveAlerts";

    /// <summary>
    /// The NC program, a signal of the manufacturer below its prefix, as the simulators publish it: the model has no
    /// element for it.
    /// </summary>
    public const string ActiveProgram = "WorkMasterMonitoring.ActiveProgram";

    /// <summary>
    /// The work master of the model. The machine has none of its own; it is the name of the NC program, the same
    /// value as <see cref="ActiveProgram"/>.
    /// </summary>
    public const string ActiveWorkMaster = "WorkMasterMonitoring.ActiveWorkMaster";

    public const string AlertRaised = "Notification.AlertRaised";
    public const string AlertCleared = "Notification.AlertCleared";
}

/// <summary>Puts what the machine says on the broker, as the binding of machines says.</summary>
internal interface IPublisher
{
    /// <summary>Begins: the connect sequence of the binding, once the broker is there.</summary>
    Task StartAsync();

    /// <summary>The machine answered a request: <c>Running</c>, after <paramref name="publications"/>.</summary>
    Task ReachedAsync(IReadOnlyList<Publication> publications);

    /// <summary>
    /// The machine said <paramref name="publications"/>, in this order. While it counts as not reached, the values
    /// are kept for the next <see cref="ReachedAsync"/>; this never reports it as reached.
    /// </summary>
    Task SaidAsync(IReadOnlyList<Publication> publications);

    /// <summary>The machine does not answer: <c>CommunicationFault</c>; the values stand.</summary>
    Task LostAsync();

    /// <summary>The sign of life of the adapter, whatever the machine does.</summary>
    Task HeartbeatAsync();

    /// <summary>A clean stop: <c>Shutdown</c>, the last message.</summary>
    Task ShutdownAsync();
}
