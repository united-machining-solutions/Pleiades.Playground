using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Pleiades.Playground.HealthChecks.AspNetCore;

/// <summary>
/// Extension methods for mapping health check endpoints with structured JSON responses.
/// </summary>
public static class HealthCheckExtensions
{
    private const string DefaultPattern = "/healthcheck";
    private const string DefaultLivenessPattern = "/health";

    /// <summary>
    /// Maps a health check endpoint at "/healthcheck" that returns a structured JSON response
    /// containing status, individual component checks, and total duration.
    /// </summary>
    /// <param name="app">The endpoint route builder.</param>
    /// <returns>The endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesHealthChecks(this IEndpointRouteBuilder app)
    {
        return MapPleiadesHealthChecks(app, DefaultPattern);
    }

    /// <summary>
    /// Maps a health check endpoint that returns a structured JSON response
    /// containing status, individual component checks, and total duration.
    /// </summary>
    /// <remarks>
    /// Returns <c>200</c> for <c>Healthy</c> and <c>Degraded</c> and <c>503</c> for <c>Unhealthy</c>,
    /// with <c>Content-Type: application/json; charset=utf-8</c>.
    /// <para>
    /// The JSON <b>property names are the CONSUMER'S, deliberately</b>, and that is a decision rather
    /// than a caution. The response is written with <c>WriteAsJsonAsync</c> and no explicit options, so
    /// the naming policy comes from the application's <c>ConfigureHttpJsonOptions</c>; with the
    /// ASP.NET Core default (web defaults, camelCase) the payload is <c>status</c> /
    /// <c>healthChecks[]</c> (<c>component</c>, <c>status</c>, <c>description</c>, <c>data</c>,
    /// <c>duration</c>) / <c>healthCheckDuration</c>.
    /// </para>
    /// <para>
    /// <b>What that means for a consumer, said plainly because the tests now enforce it:</b> the
    /// diagnostics payload is <i>not portable between services</i>. A scraper for all services keyed on
    /// <c>status</c> breaks on whichever service sets a different <c>PropertyNamingPolicy</c>, and the
    /// package will not protect it - <c>DiagnosticsEndpointTest</c> pins the per-policy name sets, so
    /// a later change to make this package own its wire format is a deliberate contract change and
    /// those tests invert rather than merely breaking.
    /// </para>
    /// <para>
    /// The alternative was to pass explicit <c>JsonSerializerOptions</c> here, which would give a
    /// scraper a stable contract at the cost of ignoring what the host application asked for. That was
    /// weighed and not taken: this endpoint is for humans and dashboards, per-service naming
    /// consistency is what a consumer's own tooling expects, and no such scraper exists today.
    /// If one is built, this is the decision to revisit first.
    /// </para>
    /// </remarks>
    /// <param name="app">The endpoint route builder.</param>
    /// <param name="pattern">The URL pattern for the health check endpoint.</param>
    /// <returns>The endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesHealthChecks(this IEndpointRouteBuilder app, string pattern)
    {
        return app.MapHealthChecks(pattern, new HealthCheckOptions
        {
            ResponseWriter = async (context, report) =>
            {
                // No ContentType assignment here. `WriteAsJsonAsync` below sets
                // "application/json; charset=utf-8" itself and overwrites whatever this line put there,
                // so the assignment that used to sit here read as if it set the response's content type
                // and did not - the charset the tests pin comes from the framework, not from us.

                var response = new
                {
                    Status = report.Status.ToString(),
                    HealthChecks = report.Entries.Select(x => new
                    {
                        Component = x.Key,
                        Status = x.Value.Status.ToString(),
                        Description = x.Value.Description,
                        x.Value.Data,
                        Duration = x.Value.Duration
                    }),
                    HealthCheckDuration = report.TotalDuration
                };

                await context.Response.WriteAsJsonAsync(response).ConfigureAwait(false);
            }
        });
    }

    /// <summary>
    /// Maps a bare liveness endpoint at "/health" that runs NO dependency checks
    /// (<c>Predicate = _ =&gt; false</c>). Intended for load-balancer / Kubernetes liveness probes hit
    /// at high frequency. Pair it with <see cref="MapPleiadesHealthChecks(IEndpointRouteBuilder)"/>
    /// (readiness/diagnostics) — do not point readiness probes at this endpoint.
    /// </summary>
    /// <remarks>
    /// The response is always <c>200 OK</c> with the health-check middleware's default minimal
    /// plaintext body: the seven ASCII bytes <c>Healthy</c>, <c>Content-Type: text/plain</c>. It is
    /// <b>not</b> an empty body.
    /// <para>
    /// <c>503</c> is unreachable here by construction: the predicate filters out every registration,
    /// an entry-less health report aggregates to <c>Healthy</c>, and only <c>Unhealthy</c> maps to
    /// <c>503</c>. That is the intended liveness semantic — "the process is serving HTTP". A process
    /// that is gone refuses the connection or times out; it does not answer <c>503</c>.
    /// </para>
    /// </remarks>
    /// <param name="app">The endpoint route builder.</param>
    /// <returns>The endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesLiveness(this IEndpointRouteBuilder app)
    {
        return MapPleiadesLiveness(app, DefaultLivenessPattern);
    }

    /// <summary>
    /// Maps a bare liveness endpoint that runs NO dependency checks
    /// (<c>Predicate = _ =&gt; false</c>) and therefore always answers <c>200 OK</c> with the seven
    /// ASCII bytes <c>Healthy</c> as <c>text/plain</c>. See
    /// <see cref="MapPleiadesLiveness(IEndpointRouteBuilder)"/> for why <c>503</c> cannot occur.
    /// </summary>
    /// <param name="app">The endpoint route builder.</param>
    /// <param name="pattern">The URL pattern for the liveness endpoint.</param>
    /// <returns>The endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesLiveness(this IEndpointRouteBuilder app, string pattern)
    {
        return app.MapHealthChecks(pattern, new HealthCheckOptions { Predicate = _ => false });
    }

    /// <summary>
    /// Maps both the bare liveness endpoint ("/health") and the JSON diagnostics endpoint ("/healthcheck")
    /// in one call. Returns the diagnostics endpoint's convention builder for further configuration.
    /// </summary>
    /// <remarks>
    /// Replace any hand-written <c>MapHealthChecks("/health", …)</c> line when adopting this — keeping
    /// both registers two endpoints on one pattern, which routing reports as an ambiguous match on the
    /// first request rather than at startup.
    /// </remarks>
    /// <param name="app">The endpoint route builder.</param>
    /// <returns>The diagnostics endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesHealthEndpoints(this IEndpointRouteBuilder app)
    {
        return MapPleiadesHealthEndpoints(app, DefaultLivenessPattern, DefaultPattern);
    }

    /// <summary>
    /// Maps both the bare liveness endpoint and the JSON diagnostics endpoint in one call.
    /// Returns the diagnostics endpoint's convention builder for further configuration.
    /// </summary>
    /// <param name="app">The endpoint route builder.</param>
    /// <param name="livenessPattern">The URL pattern for the liveness endpoint.</param>
    /// <param name="diagnosticsPattern">The URL pattern for the diagnostics endpoint.</param>
    /// <returns>The diagnostics endpoint convention builder for further configuration.</returns>
    public static IEndpointConventionBuilder MapPleiadesHealthEndpoints(
        this IEndpointRouteBuilder app,
        string livenessPattern,
        string diagnosticsPattern)
    {
        app.MapPleiadesLiveness(livenessPattern);
        return app.MapPleiadesHealthChecks(diagnosticsPattern);
    }
}
