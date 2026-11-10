using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Events.Api.Services;

/// <summary>
/// MongoDB settings
/// </summary>
internal sealed class MongoDbSettings
{
    /// <summary>
    /// MongoDB connection string
    /// </summary>
    [Required]
    public required string ConnectionString { get; init; } = "mongodb://localhost:27017";

    /// <summary>
    /// Database name
    /// </summary>
    [Required]
    public required string DatabaseName { get; init; } = "Events";

    /// <summary>
    /// Notification event collection name
    /// </summary>
    public string NotificationEventCollection { get; init; } = "NotificationEvent";

    /// <summary>
    /// Whether to ensure MongoDB indexes exist on startup
    /// </summary>
    public bool EnsureIndexesOnStartup { get; init; } = true;

    /// <summary>
    /// Optional data retention period. When set, a TTL index is created on the event collection.
    /// When null, an existing TTL index is removed to prevent stale deletion.
    /// </summary>
    public TimeSpan? DataRetentionPeriod { get; init; }
}
