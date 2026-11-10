using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Maps the endpoints of a Pleiades MCP server.
/// </summary>
public static class PleiadesMcpEndpointRouteBuilderExtensions
{
    /// <summary>
    /// Maps the MCP endpoint at <paramref name="pattern"/> and <c>GET /skill</c> (the skill guide as
    /// markdown, excluded from OpenAPI) in one group, so a single guard covers both:
    /// <c>app.MapPleiadesMcp().RequireFeatureRead(Feature.Name)</c>.
    /// </summary>
    /// <returns>The group, for authorization and other conventions.</returns>
    public static RouteGroupBuilder MapPleiadesMcp(this IEndpointRouteBuilder endpoints, string pattern = "/mcp")
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentException.ThrowIfNullOrWhiteSpace(pattern);

        var surface = endpoints.ServiceProvider.GetService<DiscoverySurface>()
            ?? throw new InvalidOperationException(
                $"Call {nameof(PleiadesMcpServerServiceCollectionExtensions.AddPleiadesMcpServer)} before {nameof(MapPleiadesMcp)}.");

        var group = endpoints.MapGroup(string.Empty);
        group.MapMcp(pattern);
        group.MapGet("/skill", () => Results.Text(surface.SkillGuide, "text/markdown; charset=utf-8"))
            .ExcludeFromDescription();
        return group;
    }
}
