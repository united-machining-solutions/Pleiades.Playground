using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// A health check that reports a fixed status and counts how often it was executed, so tests can
/// assert that the liveness endpoint runs no dependency checks at all.
/// </summary>
internal sealed class StubHealthCheck(
    HealthStatus status,
    string? description = null,
    IReadOnlyDictionary<string, object>? data = null) : IHealthCheck
{
    private int _invocations;

    internal int Invocations => Volatile.Read(ref _invocations);

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _invocations);
        return Task.FromResult(new HealthCheckResult(status, description, exception: null, data));
    }
}

/// <summary>
/// A health check that throws, so a test can pin what reaches the wire when a dependency probe
/// fails with an exception rather than returning Unhealthy.
/// </summary>
internal sealed class ThrowingHealthCheck(string message) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException(message);
}
