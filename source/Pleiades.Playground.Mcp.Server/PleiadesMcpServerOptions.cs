using System.Reflection;
using System.Text.RegularExpressions;
using ModelContextProtocol.AspNetCore;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Options for <see cref="PleiadesMcpServerServiceCollectionExtensions.AddPleiadesMcpServer"/>.
/// Only <see cref="Prefix"/> and <see cref="Title"/> are required; everything else has a Pleiades default.
/// </summary>
public sealed partial class PleiadesMcpServerOptions
{
    /// <summary>
    /// Tool-name prefix and resource scheme, lower-case letters and digits (e.g. <c>uptime</c>).
    /// Every tool of the server is expected to be named <c>{Prefix}_{domain}_{operation}</c>.
    /// </summary>
    public string Prefix { get; set; } = string.Empty;

    /// <summary>
    /// One sentence on what the server is for. First paragraph of the instructions and of the
    /// <c>{Prefix}_describe_server</c> text; also sent as <c>serverInfo.description</c>.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>High-level domains the server covers, one line each.</summary>
    public IList<string> Domains { get; } = [];

    /// <summary>Steps an agent should follow on first contact. Numbering is added by the renderer.</summary>
    public IList<string> DiscoveryFlow { get; } = [];

    /// <summary>
    /// <c>serverInfo.name</c>. Default: the server assembly name without a trailing <c>.Api</c>
    /// (e.g. <c>Pleiades.Playground.Uptime</c>).
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// <c>serverInfo.version</c>. Default: the informational version of the server assembly without
    /// build metadata, i.e. the version the pipeline stamped. Never a hard-coded <c>1.0.0</c>.
    /// </summary>
    public string? Version { get; set; }

    /// <summary>
    /// Assembly that embeds the skill guide. Default: the assembly that calls
    /// <see cref="PleiadesMcpServerServiceCollectionExtensions.AddPleiadesMcpServer"/>.
    /// </summary>
    public Assembly? ServerAssembly { get; set; }

    /// <summary>
    /// Manifest resource name of the skill guide. Default: <c>{AssemblyName}.Resources.skill.md</c>.
    /// A missing resource fails at startup, not on the first call.
    /// </summary>
    public string? SkillGuideResourceName { get; set; }

    /// <summary>
    /// Path of the OpenAPI document relative to the service base address. Default:
    /// <c>openapi/v1.json</c>, the document <c>MapOpenApi()</c> serves. The instructions link to it only
    /// when an endpoint actually serves that path, so a deployment that hides OpenAPI (e.g. Production)
    /// advertises no dead link. Set to <see langword="null"/> to never advertise the REST API.
    /// </summary>
    public string? OpenApiDocumentPath { get; set; } = "openapi/v1.json";

    /// <summary>
    /// Session handling of the Streamable HTTP transport. Default: <see cref="HttpServerSessionMode.Stateless"/>,
    /// set explicitly so that a later SDK bump cannot silently change the deployment behaviour.
    /// Protocol revision 2026-07-28 removed sessions; stateless needs no session affinity behind a load balancer.
    /// </summary>
    public HttpServerSessionMode SessionMode { get; set; } = HttpServerSessionMode.Stateless;

    /// <summary>
    /// Name of the authorization policy a tool that may write must carry (<c>[Authorize(Policy = ...)]</c>),
    /// i.e. the service's write policy. The endpoint guard is a read policy, so a tool not declared
    /// <c>ReadOnly = true</c> needs its own. When set, the startup check reports every such tool guarded by
    /// anything else, a read policy included. When not set, it still reports a bare <c>[Authorize]</c>,
    /// which admits any authenticated caller.
    /// </summary>
    public string? WritePolicy { get; set; }

    internal void Validate()
    {
        if (!PrefixPattern().IsMatch(Prefix))
        {
            throw new InvalidOperationException(
                $"MCP server prefix '{Prefix}' is invalid: use lower-case letters and digits, starting with a letter (e.g. 'uptime').");
        }

        if (string.IsNullOrWhiteSpace(Title))
        {
            throw new InvalidOperationException("MCP server title must be a non-empty sentence.");
        }
    }

    [GeneratedRegex("^[a-z][a-z0-9]*$", RegexOptions.CultureInvariant)]
    private static partial Regex PrefixPattern();
}
