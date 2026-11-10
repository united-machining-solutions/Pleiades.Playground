namespace Pleiades.Playground.Events.Api.DataTransferObjects;

/// <summary>
/// Represents a time bucket with its level distribution.
/// Each bucket contains the start timestamp and the distribution of events per level.
/// </summary>
internal sealed record TimeBucketDtoV1
{
    /// <summary>
    /// The start timestamp of the bucket.
    /// </summary>
    public DateTime Timestamp { get; init; }

    /// <summary>
    /// The distribution of events per level within this bucket.
    /// </summary>
    public required List<LevelDistributionDtoV1> Distribution { get; init; }
}
