using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.HealthChecks.MongoDb;

/// <summary>
/// Extension methods for registering MongoDB health checks.
/// </summary>
public static class HealthChecksBuilderExtensions
{
    private const string DefaultName = "mongodb";

    /// <summary>
    /// Adds a health check that verifies MongoDB connectivity by pinging the admin database.
    /// Requires <see cref="MongoDB.Driver.IMongoClient"/> to be registered in DI.
    /// Uses default timeout of 3 seconds.
    /// </summary>
    /// <param name="builder">The health checks builder.</param>
    /// <returns>The health checks builder for chaining.</returns>
    public static IHealthChecksBuilder AddMongoDb(this IHealthChecksBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.AddCheck<MongoDbHealthCheck>(DefaultName, HealthStatus.Unhealthy, ["db", DefaultName]);

        return builder;
    }

    /// <summary>
    /// Adds a health check that verifies MongoDB connectivity by pinging the admin database.
    /// Requires <see cref="MongoDB.Driver.IMongoClient"/> to be registered in DI.
    /// </summary>
    /// <param name="builder">The health checks builder.</param>
    /// <param name="timeout">Timeout for the MongoDB ping.</param>
    /// <returns>The health checks builder for chaining.</returns>
    public static IHealthChecksBuilder AddMongoDb(this IHealthChecksBuilder builder, TimeSpan timeout)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.Configure<MongoDbHealthCheckOptions>(opts =>
        {
            opts.Timeout = timeout;
        });

        builder.AddCheck<MongoDbHealthCheck>(DefaultName, HealthStatus.Unhealthy, ["db", DefaultName]);

        return builder;
    }
}
