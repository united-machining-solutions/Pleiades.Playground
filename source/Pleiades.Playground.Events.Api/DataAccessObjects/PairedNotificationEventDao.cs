using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// Represents a paired notification event with both raised and gone timestamps.
/// </summary>
internal sealed record PairedNotificationEventDao
{
    /// <summary>
    /// Correlation id that links the raised and gone events together.
    /// </summary>
    public required string CorrelationId { get; init; }

    /// <summary>
    /// Machine ID related to the event.
    /// </summary>
    public required string MId { get; init; }

    /// <summary>
    /// ID for the notification message.
    /// </summary>
    public required string NotificationId { get; init; }

    /// <summary>
    /// Level of the event.
    /// </summary>
    public EventLevel Level { get; init; }

    /// <summary>
    /// Title of the event in English.
    /// </summary>
    public string Title { get; init; } = string.Empty;

    /// <summary>
    /// Title of the event in localized language.
    /// </summary>
    public string LocalizedTitle { get; init; } = string.Empty;

    /// <summary>
    /// Timestamp when the notification was raised.
    /// </summary>
    public DateTime TimestampRaised { get; init; }

    /// <summary>
    /// Timestamp when the notification was gone/reset. Null if still active.
    /// </summary>
    public DateTime? TimestampGone { get; init; }

    /// <summary>
    /// Duration between raised and gone. Null if still active.
    /// </summary>
    public TimeSpan? Duration { get; init; }
}
