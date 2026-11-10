namespace Pleiades.Playground.Mcp.Testing;

/// <summary>
/// Options for <see cref="McpConformance.CheckAsync(HttpClient, string, McpConformanceOptions?, CancellationToken)"/>.
/// </summary>
public sealed class McpConformanceOptions
{
    /// <summary>Path of the MCP endpoint. Default: <c>/mcp</c>.</summary>
    public string Path { get; set; } = "/mcp";

    /// <summary>
    /// When <see langword="true"/>, the instructions must carry a REST link. Set it in a test that runs the
    /// service in an environment where it serves its OpenAPI document (e.g. Development). Default:
    /// <see langword="false"/>, because a service may hide OpenAPI and then rightly advertises no link.
    /// </summary>
    public bool RequireRestApi { get; set; }

    /// <summary>
    /// Tools that return the same entity as a REST endpoint and must return the same JSON for it
    /// (<see cref="McpConformance.CheckRestParityAsync(HttpClient, McpConformanceOptions?, CancellationToken)"/>).
    /// Empty by default; a service names the pairs it wants held equal.
    /// </summary>
    public IList<McpRestPair> RestParity { get; } = [];
}

/// <summary>A tool call and the REST request that must answer with the same JSON.</summary>
/// <param name="ToolName">The tool, e.g. <c>sample_job_get_by_id</c>.</param>
/// <param name="Arguments">The tool arguments.</param>
/// <param name="RestPath">The path of the matching <c>GET</c> request, e.g. <c>/jobs/42</c>.</param>
public sealed record McpRestPair(string ToolName, IReadOnlyDictionary<string, object?> Arguments, string RestPath);
