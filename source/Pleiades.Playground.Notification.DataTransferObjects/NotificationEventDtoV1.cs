using System.Text.Json.Serialization;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Notification.DataTransferObjects;

public record NotificationEventDtoV1 : IEvent
{
    /// <summary>
    /// Timestamp of when the event occurred.
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// Id of the event
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Machine ID related to the event.
    /// </summary>
    public string MId { get; set; } = string.Empty;

    /// <summary>
    /// Level of the event.
    /// </summary>
    public EventLevel Level { get; set; }

    /// <summary>
    /// Action associated with the event.
    /// </summary>
    public NotificationAction Action { get; set; }

    /// <summary>
    /// Title of the event in English. This contains a short description of the event, e.g. "Machine is in error state" or "Machine is in warning state".
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Title of the event in localized language. This contains the same short description as the English title, translated into the language of the machine.
    /// </summary>
    public string LocalizedTitle { get; set; } = string.Empty;

    /// <summary>
    /// Notification id: identification of the notification, eg. if this notification comes from the PLC it contains the PLC code. This could be feed with "classicId" from protobuf.
    /// </summary>
    public string NotificationId { get; set; } = string.Empty;

    /// <summary>
    /// Correlation id: helps correlate notification events during the timespan/action of raising and resetting.
    /// </summary>
    public string CorrelationId { get; set; } = string.Empty;
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NotificationAction
{
    None,
    Raised,
    Reset,
}
