using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Pleiades.Playground.Timeseries.Api;

/// <summary>
/// MongoDB connection settings for the Time-Series-Collection backend.
/// </summary>
internal sealed class MongoTimeseriesSettings
{
    /// <summary>
    /// Standard MongoDB connection string (e.g. <c>mongodb://user:pwd@host:27017</c>).
    /// </summary>
    [Required]
    [SuppressMessage("Security", "S2068:Hard-coded credentials are security-sensitive",
        Justification = "Local development default without credentials; production overrides via Config__MongoTimeseries__ConnectionString environment variable.")]
    public string ConnectionString { get; init; } = "mongodb://localhost:27018";

    /// <summary>
    /// Database that hosts the three timeseries collections
    /// (<c>baseunitvalues</c>, <c>stringvalues</c>, <c>booleanvalues</c>).
    /// </summary>
    [Required]
    public string DatabaseName { get; init; } = "timeseries";

    /// <summary>
    /// Whether to ensure the timeseries collections (and TTL) exist on startup.
    /// Set to <c>false</c> in test environments to avoid network calls.
    /// </summary>
    public bool EnsureIndexesOnStartup { get; init; } = true;

    /// <summary>
    /// Optional time-to-live for measurements, applied via the collection's
    /// <c>expireAfterSeconds</c> option. When <c>null</c> (the default) or non-positive, no TTL is
    /// enforced. The value is supplied per environment — e.g. on the production container via
    /// <c>Config__MongoTimeseries__DataRetentionPeriod</c> — using the .NET <see cref="TimeSpan"/>
    /// format <c>d.hh:mm:ss</c> (16 weeks = <c>112.00:00:00</c>). Deliberately not set in any
    /// appsettings file.
    /// </summary>
    public TimeSpan? DataRetentionPeriod { get; init; }

    /// <summary>
    /// Server-side maximum execution time for queries (in seconds).
    /// Applied as <c>maxTimeMS</c> on all find and aggregate operations.
    /// </summary>
    [Range(1, 300)]
    public int MaxQueryTimeSeconds { get; init; } = 30;

    /// <summary>
    /// Upper bound for the in-memory guard that suppresses redundant <c>topic_activity</c>
    /// upserts (one per <c>(type, topic, minute)</c>). The guard is a pure write-path
    /// optimization: the upsert is idempotent, so a forgotten key only causes a harmless re-upsert.
    /// </summary>
    [Range(1000, 5_000_000)]
    public int TopicActivityCacheSize { get; init; } = 500_000;
}
