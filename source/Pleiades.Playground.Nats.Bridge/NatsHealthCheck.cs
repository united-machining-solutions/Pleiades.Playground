using Microsoft.Extensions.Diagnostics.HealthChecks;
using NATS.Client.Core;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>
/// Healthy while the connection to NATS is open and the last publish went through. Unhealthy while the connection is
/// down, or when the last message was dropped (until one goes through again).
/// </summary>
internal sealed class NatsHealthCheck(INatsConnection connection, PublishOutcome outcome) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (connection.ConnectionState != NatsConnectionState.Open)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy($"connection {connection.ConnectionState}"));
        }
        return Task.FromResult(outcome.LastDrop is { } drop
            ? HealthCheckResult.Unhealthy($"connected, but the last message was dropped: {drop}")
            : HealthCheckResult.Healthy("connected"));
    }
}
