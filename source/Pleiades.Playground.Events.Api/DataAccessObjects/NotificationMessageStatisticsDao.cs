using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// Represents statistics data for a specific notification message.
/// Used as a result type for MongoDB aggregation pipelines.
/// </summary>
internal sealed record NotificationMessageStatisticsDao
{
    /// <summary>
    /// The notification message identifier (grouped _id).
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
    /// The total duration in ticks across all paired occurrences.
    /// </summary>
    public long TotalDurationTicks { get; init; }

    /// <summary>
    /// The average duration in ticks across all paired occurrences.
    /// </summary>
    public long AverageDurationTicks { get; init; }
}
