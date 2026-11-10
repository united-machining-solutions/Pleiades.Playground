namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// Represents a time bucket with its level distribution.
/// Used as a result type for MongoDB aggregation pipelines.
/// </summary>
internal sealed record TimeBucketDao
{
    /// <summary>
    /// The start timestamp of the bucket (the _id from MongoDB $dateTrunc).
    /// </summary>
    public DateTime Timestamp { get; init; }

    /// <summary>
    /// The distribution of events per level within this bucket.
    /// </summary>
    public required List<LevelDistributionDao> Distribution { get; init; }
}
