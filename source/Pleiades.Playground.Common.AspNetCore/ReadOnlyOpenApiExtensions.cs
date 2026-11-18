using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.Common.AspNetCore;

/// <summary>
/// A second OpenAPI document of an API, <c>/openapi/read.json</c>, with the reading endpoints only, and a Swagger UI
/// for it at <c>/docs/</c>. It describes what the gateway passes to clients outside the stack (ADR-0017), and the
/// gateway passes exactly this document and this UI, next to the endpoints it lists.
/// </summary>
/// <remarks>
/// An endpoint is reading when it requires the read policy of its feature and no other policy
/// (<c>RequireFeatureRead</c>). The servers of the document come from the request, so behind the gateway they
/// carry its address and prefix (<c>X-Forwarded-Prefix</c>, see
/// <see cref="ForwardedHeadersExtensions.UsePleiadesForwardedHeaders"/>), and "Try it out" goes through it.
/// </remarks>
public static class ReadOnlyOpenApiExtensions
{
    /// <summary>The name of the document; it is served at <c>/openapi/read.json</c>.</summary>
    public const string DocumentName = "read";

    /// <summary>The route prefix of its Swagger UI: <c>/docs/</c>.</summary>
    public const string UiRoutePrefix = "docs";

    /// <summary>
    /// Adds the document <see cref="DocumentName"/>, which holds the endpoints that require
    /// <paramref name="readPolicy"/> and no other policy.
    /// </summary>
    /// <param name="services">The services.</param>
    /// <param name="readPolicy">The read policy of the feature, <c>FeaturePolicy.Read(feature)</c>.</param>
    /// <param name="configure">Further options, for example a transformer for the info of the document.</param>
    public static IServiceCollection AddPleiadesReadOnlyOpenApi(
        this IServiceCollection services,
        string readPolicy,
        Action<OpenApiOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrEmpty(readPolicy);

        return services.AddOpenApi(DocumentName, options =>
        {
            options.ShouldInclude = description => OnlyReads(description, readPolicy);
            configure?.Invoke(options);
        });
    }

    /// <summary>The Swagger UI of the document <see cref="DocumentName"/> at <c>/docs/</c>.</summary>
    /// <param name="app">The application builder.</param>
    /// <param name="documentTitle">The title shown in the Swagger UI document selector.</param>
    public static IApplicationBuilder UsePleiadesReadOnlySwaggerUI(this IApplicationBuilder app, string documentTitle) =>
        app.UsePleiadesSwaggerUI(documentTitle, UiRoutePrefix, DocumentName);

    /// <summary>Whether an endpoint requires <paramref name="readPolicy"/> and no other policy.</summary>
    public static bool OnlyReads(ApiDescription description, string readPolicy)
    {
        ArgumentNullException.ThrowIfNull(description);

        var policies = description.ActionDescriptor.EndpointMetadata
            .OfType<IAuthorizeData>()
            .Select(data => data.Policy)
            .ToList();
        return policies.Count > 0 && policies.TrueForAll(policy => string.Equals(policy, readPolicy, StringComparison.Ordinal));
    }
}
