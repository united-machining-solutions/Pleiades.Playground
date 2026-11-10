using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataTransferObjects;

/// <summary>
/// Represents the count of events for a specific level.
/// </summary>
internal sealed record LevelDistributionDtoV1
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
