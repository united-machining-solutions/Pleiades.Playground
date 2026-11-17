using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// One message for the broker, below <c>machines/{SerialNumber}/</c>.
/// </summary>
/// <param name="Timestamp">The time of the observation, UTC.</param>
internal abstract record Publication(DateTime Timestamp);

/// <summary>A text value at <c>umati/&lt;Path&gt;</c>.</summary>
internal sealed record TextPublication(string Path, string Value, DateTime Timestamp) : Publication(Timestamp);

/// <summary>A number in its SI unit at <c>umati/&lt;Path&gt;</c>.</summary>
internal sealed record NumberPublication(string Path, double Value, BaseUnit Unit, DateTime Timestamp) : Publication(Timestamp);

/// <summary>An alarm that comes or goes, at <c>events/notifications</c>.</summary>
/// <param name="NotificationId">The alarm number of the machine.</param>
/// <param name="Title">The alarm text.</param>
/// <param name="Action">Raised or reset.</param>
/// <param name="CorrelationId">The same for the coming and the going of one alarm.</param>
/// <param name="Timestamp">When.</param>
internal sealed record AlarmPublication(
    string NotificationId,
    string Title,
    NotificationAction Action,
    string CorrelationId,
    DateTime Timestamp) : Publication(Timestamp);

/// <summary>
/// The paths below <c>umati/</c> the adapter publishes, named by the data model and the binding.
/// </summary>
internal static class Paths
{
    public const string ConnectionState = "Connection/State";
    public const string Heartbeat = "Connection/Heartbeat";
    public const string ItemState = "State/MachineryItemState";
    public const string OperationMode = "State/MachineryOperationMode";
    public const string FeedOverride = "State/FeedOverride";
    public const string ChannelState = "Channel/1/ChannelState";
    public const string ActiveProgram = "Production/ActiveProgram";
}

/// <summary>Sends publications to the broker.</summary>
internal interface IPublisher
{
    Task PublishAsync(IReadOnlyList<Publication> publications);
}
