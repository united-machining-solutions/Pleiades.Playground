using Microsoft.AspNetCore.Builder;

namespace Pleiades.Playground.Common.AspNetCore;

/// <summary>
/// Extensions for registering the Swashbuckle Swagger UI middleware with
/// Pleiades defaults that work transparently both directly and behind
/// a reverse proxy (Traefik <c>StripPrefix</c>, NGINX sub-path, …).
/// </summary>
public static class SwaggerUIExtensions
{
    /// <summary>
    /// Registers the Swagger UI middleware with Pleiades defaults:
    /// a page-relative OpenAPI document URL (so the Swashbuckle JS workaround
    /// for <see href="https://github.com/swagger-api/swagger-ui/issues/5945"/>
    /// resolves the spec against the served <c>index.html</c>) plus
    /// <c>DisplayRequestDuration</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The page-relative URL is computed from <paramref name="routePrefix"/>
    /// so the helper works for both common patterns:
    /// </para>
    /// <list type="bullet">
    /// <item><description>
    /// <paramref name="routePrefix"/> = <c>""</c> (UI at the application root)
    /// → spec URL <c>openapi/{documentName}.json</c>.
    /// </description></item>
    /// <item><description>
    /// <paramref name="routePrefix"/> = <c>"swagger"</c> → spec URL
    /// <c>../openapi/{documentName}.json</c>.
    /// </description></item>
    /// </list>
    /// <para>
    /// This must be called <em>after</em>
    /// <see cref="ForwardedHeadersExtensions.UsePleiadesForwardedHeaders"/>
    /// so the <c>X-Forwarded-Prefix</c> header is already projected into
    /// <see cref="Microsoft.AspNetCore.Http.HttpRequest.PathBase"/>.
    /// </para>
    /// </remarks>
    /// <param name="app">The application builder.</param>
    /// <param name="documentTitle">
    /// The title shown in the Swagger UI document selector (typically
    /// <c>$"{serviceInfo.Name} - V {serviceInfo.Version}"</c>).
    /// </param>
    public static IApplicationBuilder UsePleiadesSwaggerUI(
        this IApplicationBuilder app,
        string documentTitle)
        => UsePleiadesSwaggerUI(app, documentTitle, routePrefix: string.Empty, documentName: "v1");

    /// <summary>
    /// Overload of <see cref="UsePleiadesSwaggerUI(IApplicationBuilder, string)"/>
    /// that lets callers customize the Swagger UI route prefix (e.g. <c>"swagger"</c>
    /// to serve the UI under <c>/swagger</c>).
    /// </summary>
    /// <param name="app">The application builder.</param>
    /// <param name="documentTitle">The title shown in the Swagger UI document selector.</param>
    /// <param name="routePrefix">The Swagger UI route prefix.</param>
    public static IApplicationBuilder UsePleiadesSwaggerUI(
        this IApplicationBuilder app,
        string documentTitle,
        string routePrefix)
        => UsePleiadesSwaggerUI(app, documentTitle, routePrefix, documentName: "v1");

    /// <summary>
    /// Overload of <see cref="UsePleiadesSwaggerUI(IApplicationBuilder, string)"/>
    /// that lets callers customize both the route prefix and the OpenAPI document name.
    /// The document is expected to be served at <c>/openapi/{documentName}.json</c>,
    /// which is the default route produced by <c>app.MapOpenApi()</c>.
    /// </summary>
    /// <param name="app">The application builder.</param>
    /// <param name="documentTitle">The title shown in the Swagger UI document selector.</param>
    /// <param name="routePrefix">The Swagger UI route prefix.</param>
    /// <param name="documentName">The OpenAPI document name.</param>
    public static IApplicationBuilder UsePleiadesSwaggerUI(
        this IApplicationBuilder app,
        string documentTitle,
        string routePrefix,
        string documentName)
    {
        ArgumentNullException.ThrowIfNull(app);
        ArgumentNullException.ThrowIfNull(documentTitle);
        ArgumentNullException.ThrowIfNull(routePrefix);
        ArgumentNullException.ThrowIfNull(documentName);

        var swaggerEndpoint = BuildPageRelativeSpecUrl(routePrefix, documentName);

        return app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint(swaggerEndpoint.OriginalString, documentTitle);
            options.RoutePrefix = routePrefix;
            options.DisplayRequestDuration();
        });
    }

    /// <summary>
    /// Builds a page-relative <see cref="Uri"/> from the Swagger UI
    /// <c>index.html</c> to the OpenAPI document served at
    /// <c>/openapi/{documentName}.json</c>.
    /// </summary>
    /// <remarks>
    /// Swashbuckle's <c>index.js</c> contains a workaround that resolves
    /// page-relative URLs via
    /// <c>window.location.href.replace("index.html", url)</c>. Returning a URL
    /// without a leading slash triggers that workaround so the spec is loaded
    /// from <c>{PathBase}/openapi/{documentName}.json</c>, which is exactly
    /// what we want behind a path-stripping reverse proxy.
    /// </remarks>
    private static Uri BuildPageRelativeSpecUrl(string routePrefix, string documentName)
    {
        var depth = routePrefix
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Length;

        var specPath = $"openapi/{documentName}.json";

        var relative = depth == 0
            ? specPath
            : string.Concat(string.Concat(Enumerable.Repeat("../", depth)), specPath);

        return new Uri(relative, UriKind.Relative);
    }
}
