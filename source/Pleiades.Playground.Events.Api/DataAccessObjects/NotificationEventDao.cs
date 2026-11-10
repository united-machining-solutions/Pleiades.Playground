using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// Event to represent notifications
/// </summary>
internal sealed record NotificationEventDao : IEvent
{
    /// <summary>
    /// Timestamp of when the event occurred.
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// Id of the event
    /// </summary>
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public required string Id { get; set; }

    /// <summary>
    /// Machine ID related to the event.
    /// </summary>
    public required string MId { get; set; }

    /// <summary>
    /// Level of the event.
    /// </summary>
    [BsonRepresentation(BsonType.String)]
    public EventLevel Level { get; set; }

    /// <summary>
    /// Action associated with the event.
    /// </summary>
    [BsonRepresentation(BsonType.String)]
    public NotificationAction Action { get; init; }

    /// <summary>
    /// Title of the event in English. This contains a short description of the event, e.g. "Machine is in error state" or "Machine is in warning state".
    /// </summary>
    public string Title { get; init; } = string.Empty;

    /// <summary>
    /// Title of the event in localized language. This contains the same short description as the English title, translated into the language of the machine.
    /// </summary>
    public string LocalizedTitle { get; init; } = string.Empty;

    /// <summary>
    /// ID for the message.
    /// </summary>
    public required string NotificationId { get; init; }

    /// <summary>
    /// Correlation id: helps correlate notification events during the timespan/action of raising and resetting.
    /// </summary>
    public string CorrelationId { get; init; } = string.Empty;
}
