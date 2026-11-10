using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// Represents the count of events for a specific level.
/// Used as a result type for MongoDB aggregation pipelines.
/// </summary>
internal sealed record LevelDistributionDao
{
    /// <summary>
    /// The event level.
    /// </summary>
    public EventLevel Level { get; init; }

    /// <summary>
    /// The number of events with this level.
    /// </summary>
    public int Count { get; init; }
}
