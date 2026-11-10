using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Pleiades.Playground.HealthChecks.MongoDb;

/// <summary>
/// Health check that verifies MongoDB connectivity by pinging the admin database.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage(
    "Performance",
    "CA1812:Avoid uninstantiated internal classes",
    Justification = "MongoDbHealthCheck is instantiated dynamically by DI via AddCheck<T>.")]
internal sealed class MongoDbHealthCheck(IMongoClient client, IOptions<MongoDbHealthCheckOptions> options) : IHealthCheck
{
    /// <inheritdoc />
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        using var timeoutCts = new CancellationTokenSource(options.Value.Timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            await client.GetDatabase("admin")
                .RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: linkedCts.Token)
                .ConfigureAwait(false);

            return HealthCheckResult.Healthy("MongoDB is reachable.");
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy($"MongoDB health check timed out after {options.Value.Timeout.TotalSeconds:F0}s.");
        }
        catch (MongoException ex)
        {
            return HealthCheckResult.Unhealthy("MongoDB is unreachable.", ex);
        }
    }
}
