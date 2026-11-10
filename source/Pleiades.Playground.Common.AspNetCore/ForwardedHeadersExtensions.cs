using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.Common.AspNetCore;

/// <summary>
/// Extension methods for configuring forwarded headers behind a reverse proxy
/// (NGINX, Traefik, ingress controllers, …).
/// </summary>
public static class ForwardedHeadersExtensions
{
    /// <summary>
    /// Registers <see cref="ForwardedHeadersOptions"/> so the application honors
    /// <c>X-Forwarded-For</c>, <c>X-Forwarded-Proto</c>, <c>X-Forwarded-Host</c> and
    /// <c>X-Forwarded-Prefix</c>. The known proxy / known network lists are cleared so any
    /// proxy on the container network is trusted (typical for in-cluster deployments).
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddPleiadesForwardedHeaders(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
                                     | ForwardedHeaders.XForwardedProto
                                     | ForwardedHeaders.XForwardedHost
                                     | ForwardedHeaders.XForwardedPrefix;

#if NET10_0_OR_GREATER
            options.KnownIPNetworks.Clear();
#else
            options.KnownNetworks.Clear();
#endif
            options.KnownProxies.Clear();
        });

        return services;
    }

    /// <summary>
    /// Activates forwarded-header processing and applies the <c>X-Forwarded-Prefix</c> header
    /// to <see cref="HttpRequest.PathBase"/> so that path-based reverse-proxy routing
    /// (e.g. <c>/timeseries-api/...</c>) is transparent to the application and any generated
    /// URLs (Swagger UI, OpenAPI document, redirects, …).
    /// </summary>
    /// <remarks>
    /// ASP.NET Core's <c>UseForwardedHeaders</c> reads <c>X-Forwarded-Prefix</c> into
    /// <see cref="HttpRequest.PathBase"/> only when the prefix originally was present in
    /// <see cref="HttpRequest.Path"/>. Reverse proxies that strip the prefix before forwarding
    /// (Traefik <c>StripPrefix</c>, NGINX <c>proxy_pass</c> with sub-path) leave
    /// <see cref="HttpRequest.Path"/> empty — this middleware fills <see cref="HttpRequest.PathBase"/>
    /// from the header in that case.
    /// </remarks>
    /// <param name="app">The application builder.</param>
    /// <returns>The application builder for chaining.</returns>
    public static IApplicationBuilder UsePleiadesForwardedHeaders(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseForwardedHeaders();
        app.Use(ApplyForwardedPrefixMiddleware);

        return app;
    }

    private static Task ApplyForwardedPrefixMiddleware(HttpContext context, RequestDelegate next)
    {
        if (TryGetForwardedPrefix(context.Request, out var prefix))
        {
            ApplyForwardedPrefix(context.Request, prefix);
        }

        return next(context);
    }

    private static bool TryGetForwardedPrefix(HttpRequest request, out PathString prefix)
    {
        prefix = default;

        if (!request.Headers.TryGetValue("X-Forwarded-Prefix", out var values))
        {
            return false;
        }

        var raw = values.ToString();
        if (string.IsNullOrEmpty(raw))
        {
            return false;
        }

        if (!raw.StartsWith('/'))
        {
            raw = "/" + raw;
        }

        if (raw.Length > 1 && raw.EndsWith('/'))
        {
            raw = raw[..^1];
        }

        prefix = new PathString(raw);
        return true;
    }

    private static void ApplyForwardedPrefix(HttpRequest request, PathString prefix)
    {
        if (request.PathBase.HasValue &&
            request.PathBase.Equals(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (request.Path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase, out var remaining))
        {
            request.Path = remaining;
        }

        request.PathBase = prefix;
    }
}
