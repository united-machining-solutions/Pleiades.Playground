using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Discovery;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Checks the server against the Pleiades conventions once at startup, logs every deviation as a warning and
/// keeps it in <see cref="McpServerConventionReport"/>. Warnings, not exceptions: an existing server must keep
/// starting while it converges; its tests make the report a gate.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by the host via AddHostedService.")]
internal sealed partial class McpServerConventionCheck(
    IOptions<McpServerOptions> serverOptions,
    DiscoverySurface surface,
    ServiceToolRegistry serviceTools,
    McpServerConventionReport report,
    IServiceProvider services,
    IHostApplicationLifetime lifetime,
    ILogger<McpServerConventionCheck> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var instructionsLength = surface.EstimateInstructionsLength();
        if (instructionsLength > ServerInstructionsRenderer.RecommendedMaxLength)
        {
            Report(
                $"MCP server instructions are about {instructionsLength} characters; clients truncate above " +
                $"{ServerInstructionsRenderer.RecommendedMaxLength}. Shorten the domains or the discovery flow.");
        }

        // The routes are wired only once the web host has started, after this service.
        lifetime.ApplicationStarted.Register(CheckSkillRoute);
        CheckDuplicateToolNames();

        foreach (var tool in serverOptions.Value.ToolCollection ?? [])
        {
            CheckTool(tool);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private void CheckTool(McpServerTool tool)
    {
        var name = tool.ProtocolTool.Name;
        var isDiscoveryTool = name == surface.DescribeToolName || name == surface.SkillGuideToolName;

        if (!name.StartsWith(surface.Prefix + "_", StringComparison.Ordinal))
        {
            Report($"MCP tool '{name}' does not start with the server prefix '{surface.Prefix}_'.");
        }

        // By reference: if the name was registered twice, the copy the SDK kept is what counts.
        if (!isDiscoveryTool && !serviceTools.Contains(tool))
        {
            Report(
                $"MCP tool '{name}' is registered past the service's HTTP JSON options, so it can serialize differently " +
                "from REST; register the tools with WithPleiadesToolsFromAssembly().");
        }

        // The two checks are independent: a tool that does not declare ReadOnly may write as well.
        var readOnly = tool.ProtocolTool.Annotations?.ReadOnlyHint;
        if (readOnly is null)
        {
            Report($"MCP tool '{name}' does not declare ReadOnly; set ReadOnly = true for reads, or false plus Destructive/Idempotent for writes.");
        }

        if (readOnly is not true)
        {
            CheckWriteGuard(name, tool.Metadata.OfType<IAuthorizeData>().ToList());
        }
    }

    // The endpoint guard is a read policy, so a tool that may write needs a guard of its own, and a bare
    // [Authorize] or a read policy is no write guard at all.
    private void CheckWriteGuard(string name, List<IAuthorizeData> guards)
    {
        if (guards.Count == 0)
        {
            Report($"MCP tool '{name}' may write (ReadOnly is not true) and carries no [Authorize]; it is reachable with the read permission that guards the endpoint.");
        }
        else if (surface.WritePolicy is { } writePolicy)
        {
            if (!guards.Any(g => string.Equals(g.Policy, writePolicy, StringComparison.Ordinal)))
            {
                var policies = string.Join(", ", guards.Select(g => string.IsNullOrWhiteSpace(g.Policy) ? "[Authorize] without a policy" : $"'{g.Policy}'"));
                Report($"MCP tool '{name}' may write but is not guarded by the write policy '{writePolicy}' ({policies}).");
            }
        }
        else if (guards.All(g => string.IsNullOrWhiteSpace(g.Policy) && string.IsNullOrWhiteSpace(g.Roles)))
        {
            Report($"MCP tool '{name}' may write and carries a bare [Authorize], which admits any authenticated caller; name the write policy (and set WritePolicy).");
        }
    }

    // MapPleiadesMcp maps GET /skill. A service that keeps its own mapping gets two endpoints for one
    // route, and routing then answers every request with 500 (AmbiguousMatchException).
    private void CheckSkillRoute()
    {
        if (services.GetService<EndpointDataSource>() is not { } dataSource)
        {
            return;
        }

        var skillRoutes = dataSource.Endpoints.OfType<RouteEndpoint>().Count(e =>
            string.Equals(e.RoutePattern.RawText?.Trim('/'), "skill", StringComparison.OrdinalIgnoreCase)
            && (e.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods.Contains("GET", StringComparer.OrdinalIgnoreCase) ?? true));
        if (skillRoutes > 1)
        {
            Report(
                $"GET /skill is mapped {skillRoutes} times, so every request to it answers 500 (AmbiguousMatchException). " +
                "MapPleiadesMcp serves the guide behind the MCP guard; delete the service's own MapGet(\"/skill\").");
        }
    }

    // The SDK keeps the first tool per name and drops the rest without a word.
    private void CheckDuplicateToolNames()
    {
        foreach (var duplicate in services.GetServices<McpServerTool>()
            .GroupBy(t => t.ProtocolTool.Name, StringComparer.Ordinal)
            .Where(g => g.Count() > 1))
        {
            Report($"MCP tool '{duplicate.Key}' is registered {duplicate.Count()} times; the SDK serves the first registration and drops the others.");
        }
    }

    private void Report(string deviation)
    {
        report.Add(deviation);
        LogDeviation(deviation);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Deviation}")]
    private partial void LogDeviation(string deviation);
}
