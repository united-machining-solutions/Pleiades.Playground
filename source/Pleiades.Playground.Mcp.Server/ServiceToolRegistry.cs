using System.Collections.Concurrent;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// The tool instances created through <see cref="PleiadesMcpServerBuilderExtensions"/>, i.e. with the
/// service's HTTP JSON options. Compared by reference: when a name is registered twice the SDK keeps the
/// first instance, so a name alone cannot tell which copy is served.
/// </summary>
internal sealed class ServiceToolRegistry
{
    private readonly ConcurrentDictionary<McpServerTool, bool> _tools = new(ReferenceEqualityComparer.Instance);

    internal void Add(McpServerTool tool) => _tools.TryAdd(tool, true);

    internal bool Contains(McpServerTool tool) => _tools.ContainsKey(tool);
}
