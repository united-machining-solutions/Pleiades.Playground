using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataTransferObjects;

/// <summary>
/// Represents statistics data for a specific notification message,
/// including occurrence count and duration statistics.
/// </summary>
internal sealed record NotificationMessageStatisticsDtoV1
{
    /// <summary>
    /// The notification message identifier.
    /// </summary>
    public required string NotificationId { get; init; }

    /// <summary>
    /// The title of the notification message.
    /// </summary>
    public required string Title { get; init; }

    /// <summary>
    /// The event level.
    /// </summary>
    public EventLevel Level { get; init; }

    /// <summary>
    /// The number of times this notification was raised.
    /// </summary>
    public int OccurrenceCount { get; init; }

    /// <summary>
    /// The total duration across all paired occurrences.
    /// </summary>
    public TimeSpan TotalDuration { get; init; }

    /// <summary>
    /// The average duration across all paired occurrences.
    /// </summary>
    public TimeSpan AverageDuration { get; init; }
}
