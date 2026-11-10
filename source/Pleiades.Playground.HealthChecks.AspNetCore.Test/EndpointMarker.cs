using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// Metadata attached via the <see cref="IEndpointConventionBuilder"/> a Map* helper returns, so a
/// test can prove <i>which</i> endpoint that builder actually configures. Both health endpoints
/// share the display name "Health checks", so the route pattern is the only discriminator.
/// </summary>
#pragma warning disable S2094 // A marker type is intentionally empty — it exists only as endpoint metadata.
internal sealed class EndpointMarker;
#pragma warning restore S2094

internal static class EndpointMarkerExtensions
{
    /// <summary>Returns the raw route pattern of the single endpoint carrying an <see cref="EndpointMarker"/>.</summary>
    internal static string FindMarkedRoutePattern(this WebApplication app)
    {
        var marked = app.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.Metadata.GetMetadata<EndpointMarker>() is not null)
            .ToList();

        Assert.HasCount(1, marked, "Exactly one endpoint should carry the marker.");
        return marked[0].RoutePattern.RawText!;
    }
}
