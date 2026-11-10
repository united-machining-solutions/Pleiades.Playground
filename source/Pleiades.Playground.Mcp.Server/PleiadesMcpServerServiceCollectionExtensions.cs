using System.Reflection;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Registers a Pleiades MCP server with the Pleiades defaults.
/// </summary>
public static class PleiadesMcpServerServiceCollectionExtensions
{
    /// <summary>
    /// Registers the MCP server of a service: <c>serverInfo</c> with the stamped version, the Streamable
    /// HTTP transport in an explicit session mode, authorization filters (so <c>[Authorize]</c> on a
    /// tool is honoured and <c>tools/list</c> is filtered per caller), the spec-native instructions incl.
    /// the OpenAPI link, and the discovery surface <c>{prefix}_describe_server</c>,
    /// <c>{prefix}_get_skill_guide</c> and the resource <c>{prefix}://skill</c>.
    /// </summary>
    /// <remarks>
    /// Chain the server's own tools and resources on the returned builder, the tools with
    /// <see cref="PleiadesMcpServerBuilderExtensions.WithPleiadesToolsFromAssembly"/> so they serialize with
    /// the service's HTTP JSON options, and map the endpoint with
    /// <see cref="PleiadesMcpEndpointRouteBuilderExtensions.MapPleiadesMcp"/>.
    /// The describe text lists the registered tools the caller may see at call time, so it cannot drift.
    /// The startup check's findings are logged and kept in <see cref="McpServerConventionReport"/> for tests.
    /// </remarks>
    /// <exception cref="InvalidOperationException">
    /// Thrown when the prefix or title is invalid, or when the skill guide is not embedded.
    /// </exception>
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static IMcpServerBuilder AddPleiadesMcpServer(
        this IServiceCollection services,
        Action<PleiadesMcpServerOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);

        var options = new PleiadesMcpServerOptions();
        configure(options);
        options.Validate();

        var surface = new DiscoverySurface(options, options.ServerAssembly ?? Assembly.GetCallingAssembly());
        services.AddSingleton(surface);
        services.TryAddSingleton<ServiceToolRegistry>();
        services.TryAddSingleton<McpServerConventionReport>();
        services.AddHostedService<McpServerConventionCheck>();

        var builder = services
            .AddMcpServer(server =>
            {
                server.ServerInfo = new Implementation
                {
                    Name = surface.Name,
                    Version = surface.Version,
                    Description = options.Title,
                };
                server.ServerInstructions = surface.RenderInstructions();
            })
            .WithHttpTransport(transport => transport.SessionMode = options.SessionMode)
            .AddAuthorizationFilters();

        // Chained, not assigned: a hook the service sets itself, before or after this call, keeps running.
        // PostConfigure runs after every Configure whatever the registration order; the service's hook runs
        // after the instructions are rendered, so it can still amend them.
        services.PostConfigure<HttpServerTransportOptions>(transport =>
        {
            var serviceHook = transport.ConfigureSessionOptions;
            transport.ConfigureSessionOptions = async (httpContext, serverOptions, cancellationToken) =>
            {
                serverOptions.ServerInstructions = surface.RenderInstructions(httpContext);
                if (serviceHook is not null)
                {
                    await serviceHook(httpContext, serverOptions, cancellationToken).ConfigureAwait(false);
                }
            };
        });

        builder.WithTools(
        [
            McpServerTool.Create(
                (RequestContext<CallToolRequestParams> context) => surface.RenderDescriptionAsync(context),
                new McpServerToolCreateOptions
                {
                    Name = surface.DescribeToolName,
                    Title = "Describe server",
                    Description =
                        "Describe this MCP server, its domains, the recommended discovery flow and the available tools. " +
                        "Use this first if you are connected but do not yet know which tools or resources are available.",
                    ReadOnly = true,
                    Idempotent = true,
                    Destructive = false,
                    OpenWorld = false,
                }),
            McpServerTool.Create(
                () => surface.SkillGuide,
                new McpServerToolCreateOptions
                {
                    Name = surface.SkillGuideToolName,
                    Title = "Get skill guide",
                    Description =
                        "Return the full skill guide of this server as markdown: the domain model, recommended workflows, " +
                        "paging rules and conventions. Have it in context before the first query; some hosts load it into " +
                        "the conversation when they connect, so call this only when it is not already there.",
                    ReadOnly = true,
                    Idempotent = true,
                    Destructive = false,
                    OpenWorld = false,
                }),
        ]);

        builder.WithResources(
        [
            McpServerResource.Create(
                () => surface.SkillGuide,
                new McpServerResourceCreateOptions
                {
                    UriTemplate = surface.SkillGuideUri,
                    Name = $"{surface.Prefix}-skill-guide",
                    Title = "Skill guide",
                    Description = "The full skill guide of this server as markdown.",
                    MimeType = "text/markdown",
                }),
        ]);

        return builder;
    }
}
