namespace Pleiades.Playground.HealthChecks.MongoDb;

/// <summary>
/// Configuration options for the MongoDB health check.
/// </summary>
public sealed class MongoDbHealthCheckOptions
{
    /// <summary>
    /// Gets or sets the timeout for the MongoDB ping command.
    /// Defaults to 3 seconds.
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(3);
}
