using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Serilog;
using Serilog.Events;

namespace Pleiades.Playground.Common.Logging.AspNetCore;

public static class PleiadesRequestLoggingExtensions
{
    /// <summary>
    /// Enables Serilog request logging with Pleiades defaults.
    /// - Concise message template with query string
    /// - Filters out health check noise (logs as Verbose)
    /// - Enriches with RequestId, ClientIP, UserAgent, FullUrl, and QueryParams
    /// </summary>
    public static IApplicationBuilder UsePleiadesRequestLogging(this IApplicationBuilder app)
    {
        return app.UseSerilogRequestLogging(options =>
        {
            options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
            {
                var request = httpContext.Request;

                diagnosticContext.Set("RequestId", httpContext.TraceIdentifier);

                var queryString = request.QueryString.HasValue ? request.QueryString.Value! : string.Empty;
                diagnosticContext.Set("RequestQueryString", queryString);

                if (!IsHealthCheckRequest(request.Path))
                {
                    diagnosticContext.Set("FullUrl", $"{request.Scheme}://{request.Host}{request.Path}{queryString}");

                    if (request.Query.Count > 0)
                    {
                        diagnosticContext.Set("QueryParams",
                            request.Query.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToString()));
                    }

                    var clientIp = request.Headers["X-Forwarded-For"].FirstOrDefault()
                                   ?? httpContext.Connection.RemoteIpAddress?.ToString();
                    if (!string.IsNullOrEmpty(clientIp))
                    {
                        diagnosticContext.Set("ClientIP", clientIp);
                    }

                    var userAgent = request.Headers.UserAgent.FirstOrDefault();
                    if (!string.IsNullOrEmpty(userAgent))
                    {
                        diagnosticContext.Set("UserAgent", userAgent);
                    }
                }
            };

            options.MessageTemplate =
                "HTTP {RequestMethod} {RequestPath}{RequestQueryString} responded {StatusCode} in {Elapsed:0.0000} ms";

            options.GetLevel = (httpContext, _, _) =>
                IsHealthCheckRequest(httpContext.Request.Path) ? LogEventLevel.Verbose : LogEventLevel.Information;
        });
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsHealthCheckRequest(PathString path) =>
        path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase) ||
        path.StartsWithSegments("/healthcheck", StringComparison.OrdinalIgnoreCase);
}
