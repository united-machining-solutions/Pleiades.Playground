using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.Timeseries.Api.Services;

namespace Pleiades.Playground.Timeseries.Api.HealthChecks;

/// <summary>
/// Health check for MongoDB connectivity. Delegates to <see cref="ITimeseriesDbService.PingAsync"/>
/// so the same probe is used by the active backend regardless of provider.
/// </summary>
internal sealed class MongoTimeseriesHealthCheck(ITimeseriesDbService timeseriesDbService) : IHealthCheck
{
    /// <inheritdoc />
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var isReachable = await timeseriesDbService.PingAsync(cancellationToken).ConfigureAwait(false);

            return isReachable
                ? HealthCheckResult.Healthy("MongoDB is reachable.")
                : HealthCheckResult.Unhealthy("MongoDB is unreachable.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("MongoDB health check failed.", ex);
        }
    }
}
