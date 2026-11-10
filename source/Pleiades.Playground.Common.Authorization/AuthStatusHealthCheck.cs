using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Surfaces the authentication on/off state in the diagnostic health endpoint, so a service running
/// with auth disabled is visible rather than silent.
/// </summary>
/// <remarks>
/// <para>
/// <b>Always <see cref="HealthStatus.Healthy"/>, and the state is in the payload rather than in the
/// status.</b> This check reports a <i>configuration fact</i>, not a fault: the value it returns is
/// fixed for the lifetime of the process and nothing the service can do will change it. ASP.NET
/// logs every non-Healthy result at <c>Warning</c> on <b>every</b> evaluation, so reporting Degraded
/// meant re-asserting a constant 8,640 times a day per service at a 10 s probe interval — measured
/// on one device as <b>17,230 lines in 16 h</b>, of which the first carried all the
/// information.
/// </para>
/// <para>
/// <b>Nothing is hidden by this.</b> The Pleiades diagnostics writer emits <c>Description</c> and
/// <c>Data</c> for every entry, so <c>/healthcheck</c> still answers the question at any time — and
/// it answers it better than a status did, because
/// <c>Data["authenticationEnabled"]</c> is a boolean a dashboard or a test can read, where
/// <c>Degraded</c> had to be distinguished from every other check's Degraded by grepping the body.
/// That was the only machine-readable signal before; it is now the weaker of two.
/// </para>
/// <para>
/// <b>What this deliberately gives up:</b> a red dot in tooling that colours by aggregate status.
/// The aggregate is unchanged either way for the container — Degraded already mapped to HTTP 200,
/// and only Unhealthy answers 503 — so no compose <c>healthcheck</c>, no
/// <c>depends_on: service_healthy</c> and no load balancer behaves differently. What changes is
/// whether a constant is re-asserted on a timer.
/// </para>
/// <para>
/// <b>The rule this satisfies, stated here rather than cited.</b> Every service registers this
/// check so that "auth is off" is visible <i>on the endpoint monitoring already polls</i>, instead of
/// living in one startup log line that scrolls away. Safe to add anywhere: the diagnostics endpoint
/// maps anything short of <see cref="HealthStatus.Unhealthy"/> to HTTP 200, so no container
/// healthcheck and no load balancer changes behaviour. That requirement is unchanged by reporting
/// Healthy — the status was the mechanism, and the payload is a better one.
/// </para>
/// </remarks>
[SuppressMessage("Performance", "CA1812",
    Justification = "Instantiated by the DI container via AddCheck<T>() in AddPleiadesAuthStatus.")]
internal sealed class AuthStatusHealthCheck(AuthOptions options) : IHealthCheck
{
    internal const string EnabledKey = "authenticationEnabled";
    internal const string EnabledDescription = "Authentication enabled";
    internal const string DisabledDescription = "Authentication DISABLED — anonymous access";

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var enabled = options.Enabled;

        return Task.FromResult(HealthCheckResult.Healthy(
            enabled ? EnabledDescription : DisabledDescription,
            new Dictionary<string, object> { [EnabledKey] = enabled }));
    }
}
