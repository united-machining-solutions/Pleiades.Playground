using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Discovery;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Everything the discovery surface of one server needs, resolved once at registration.
/// </summary>
internal sealed class DiscoverySurface
{
    private const string OpenApiRoutePattern = "openapi/{documentName}.json";

    private readonly object _openApiLock = new();
    private bool? _openApiServed;

    internal DiscoverySurface(PleiadesMcpServerOptions options, Assembly serverAssembly)
    {
        Prefix = options.Prefix;
        Description = new ServerDescription(options.Title, [.. options.Domains], [.. options.DiscoveryFlow], []);
        OpenApiDocumentPath = options.OpenApiDocumentPath?.Trim('/');
        WritePolicy = string.IsNullOrWhiteSpace(options.WritePolicy) ? null : options.WritePolicy;

        var assemblyName = serverAssembly.GetName().Name ?? throw new InvalidOperationException("The server assembly has no name.");
        Name = options.Name ?? (assemblyName.EndsWith(".Api", StringComparison.Ordinal) ? assemblyName[..^4] : assemblyName);
        Version = options.Version ?? ReadVersion(serverAssembly);
        SkillGuideResourceName = options.SkillGuideResourceName ?? $"{assemblyName}.Resources.skill.md";

        // Read now: a missing guide is a packaging bug and must stop the service at startup,
        // not surface as a failed tool call in front of a user.
        SkillGuide = EmbeddedResourceReader.Read(serverAssembly, SkillGuideResourceName);
    }

    internal string Prefix { get; }

    internal ServerDescription Description { get; }

    internal string? OpenApiDocumentPath { get; }

    internal string? WritePolicy { get; }

    internal string Name { get; }

    internal string Version { get; }

    internal string SkillGuideResourceName { get; }

    internal string SkillGuide { get; }

    internal string DescribeToolName => $"{Prefix}_describe_server";

    internal string SkillGuideToolName => $"{Prefix}_get_skill_guide";

    internal string SkillGuideUri => $"{Prefix}://skill";

    /// <summary>
    /// The <c>{prefix}_describe_server</c> text: the instructions this client received (request-aware,
    /// incl. the REST line) followed by the registered tools this caller may see, so the list cannot drift
    /// and names no tool that <c>tools/list</c> hides from the caller.
    /// Clients that never read <c>instructions</c> get the same content through this tool.
    /// </summary>
    internal async Task<string> RenderDescriptionAsync(RequestContext<CallToolRequestParams> context)
    {
        var options = context.Server.ServerOptions;
        var instructions = options.ServerInstructions ?? RenderInstructions();

        var tools = new List<string>();
        foreach (var tool in options.ToolCollection ?? [])
        {
            var name = tool.ProtocolTool.Name;
            if (name != DescribeToolName && name != SkillGuideToolName && await IsVisibleAsync(tool, context).ConfigureAwait(false))
            {
                tools.Add(name);
            }
        }

        if (tools.Count == 0)
        {
            return instructions;
        }

        tools.Sort(StringComparer.Ordinal);
        return instructions + "\nAvailable tools:\n" + string.Concat(tools.Select(t => "- " + t + "\n"));
    }

    // The rule AddAuthorizationFilters applies to tools/list: a tool carrying [Authorize] is listed only for a
    // caller who satisfies its combined policy, [AllowAnonymous] lists it for everyone. Without authorization
    // services a guarded tool is hidden rather than advertised.
    private static async Task<bool> IsVisibleAsync(McpServerTool tool, MessageContext context)
    {
        if (tool.Metadata.OfType<IAllowAnonymous>().Any())
        {
            return true;
        }

        var guards = tool.Metadata.OfType<IAuthorizeData>().ToList();
        if (guards.Count == 0)
        {
            return true;
        }

        var services = context.Services;
        if (services?.GetService<IAuthorizationPolicyProvider>() is not { } policyProvider
            || services.GetService<IAuthorizationService>() is not { } authorization)
        {
            return false;
        }

        var policy = await AuthorizationPolicy.CombineAsync(policyProvider, guards).ConfigureAwait(false);
        if (policy is null)
        {
            return true;
        }

        var user = context.User ?? new ClaimsPrincipal(new ClaimsIdentity());
        return (await authorization.AuthorizeAsync(user, tool, policy).ConfigureAwait(false)).Succeeded;
    }

    /// <summary>Instructions without the REST line, for transports that have no HTTP request.</summary>
    internal string RenderInstructions() => ServerInstructionsRenderer.Render(Description, Prefix, restApi: null);

    /// <summary>
    /// Length of the instructions with a long, realistic OpenAPI link, to check the client budget at startup.
    /// </summary>
    internal int EstimateInstructionsLength()
    {
        var sample = new RestApiReference(new Uri($"https://gateway.demo.playground.pleiades.example/{Prefix}-api/{OpenApiDocumentPath ?? "openapi/v1.json"}"));
        return ServerInstructionsRenderer.Render(Description, Prefix, OpenApiDocumentPath is null ? null : sample).Length;
    }

    /// <summary>Instructions as the calling client reached the service, incl. the absolute OpenAPI link when served.</summary>
    internal string RenderInstructions(HttpContext httpContext)
    {
        var restApi = ResolveRestApi(httpContext);
        return ServerInstructionsRenderer.Render(Description, Prefix, restApi);
    }

    private RestApiReference? ResolveRestApi(HttpContext httpContext)
    {
        if (OpenApiDocumentPath is null || !IsOpenApiServed(httpContext.RequestServices))
        {
            return null;
        }

        // Scheme, host and PathBase as the client saw them: behind Traefik the forwarded-headers
        // middleware has already applied X-Forwarded-Proto/-Host/-Prefix. A host that does not form a
        // URI (empty, "a!b", or "a!..b", which is no valid IDN name) drops the line instead of failing the request.
        var request = httpContext.Request;
        if (!request.Host.HasValue)
        {
            return null;
        }

        try
        {
            // BuildAbsolute IDN-maps the host and throws for a name it cannot map.
            var link = UriHelper.BuildAbsolute(request.Scheme, request.Host, request.PathBase, new PathString("/" + OpenApiDocumentPath));
            return Uri.TryCreate(link, UriKind.Absolute, out var document)
                ? new RestApiReference(document)
                : null;
        }
        catch (Exception e) when (e is ArgumentException or UriFormatException)
        {
            return null;
        }
    }

    private bool IsOpenApiServed(IServiceProvider services)
    {
        if (_openApiServed is { } known)
        {
            return known;
        }

        lock (_openApiLock)
        {
            _openApiServed ??= services.GetService<EndpointDataSource>() is { } dataSource
                && dataSource.Endpoints.OfType<RouteEndpoint>().Any(e => Serves(e.RoutePattern.RawText));
            return _openApiServed.Value;
        }
    }

    private bool Serves(string? rawPattern)
    {
        if (rawPattern is null || OpenApiDocumentPath is null)
        {
            return false;
        }

        var pattern = rawPattern.Trim('/');
        if (string.Equals(pattern, OpenApiDocumentPath, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // MapOpenApi() serves every registered document through one parameterised route.
        return string.Equals(pattern, OpenApiRoutePattern, StringComparison.OrdinalIgnoreCase)
            && OpenApiDocumentPath.StartsWith("openapi/", StringComparison.OrdinalIgnoreCase)
            && OpenApiDocumentPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase);
    }

    private static string ReadVersion(Assembly assembly)
    {
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            var plus = informational.IndexOf('+', StringComparison.Ordinal);
            return plus > 0 ? informational[..plus] : informational;
        }

        return assembly.GetName().Version?.ToString() ?? "0.0.0";
    }
}
