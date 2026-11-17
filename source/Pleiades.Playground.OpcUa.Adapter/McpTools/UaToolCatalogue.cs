using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.OpcUa.Adapter.McpTools;

/// <summary>
/// The tools of the OPC UA MCP library of the OPC Foundation that the adapter offers. The library
/// comes with every service of OPC UA, also those that write a value, call a method or change the
/// address space of a machine. A scan needs none of those, so only the ones named here stay: find
/// the endpoints, open a session, browse and read. Everything else is taken out of the server, so
/// it can be neither listed nor called.
/// </summary>
internal static class UaToolCatalogue
{
    /// <summary>The prefix of every tool of this server, by the rule of <c>contracts/mcp</c>.</summary>
    public const string Prefix = "opcua_";

    /// <summary>The name in the library, and the name here.</summary>
    public static IReadOnlyDictionary<string, string> Kept { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["GetEndpoints"] = "opcua_ua_get_endpoints",
        ["Connect"] = "opcua_ua_connect",
        ["Disconnect"] = "opcua_ua_disconnect",
        ["GetConnectionStatus"] = "opcua_ua_get_connection_status",
        ["Browse"] = "opcua_ua_browse",
        ["BrowseNext"] = "opcua_ua_browse_next",
        ["BrowseAll"] = "opcua_ua_browse_all",
        ["TranslateBrowsePaths"] = "opcua_ua_translate_browse_paths",
        ["Read"] = "opcua_ua_read",
        ["ReadNode"] = "opcua_ua_read_node",
        ["ReadValue"] = "opcua_ua_read_value",
        ["ReadValues"] = "opcua_ua_read_values",
    };

    /// <summary>
    /// Removes every tool of the library that is not kept, and gives the kept ones the prefix of
    /// this server. Tools that carry the prefix already are the adapter's own and stay as they are.
    /// </summary>
    public static void Apply(McpServerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (options.ToolCollection is not { } tools)
        {
            return;
        }

        foreach (var tool in tools.ToList())
        {
            var name = tool.ProtocolTool.Name;
            if (name.StartsWith(Prefix, StringComparison.Ordinal))
            {
                continue;
            }

            tools.Remove(tool);
            if (Kept.TryGetValue(name, out var renamed))
            {
                tool.ProtocolTool.Name = renamed;
                // None of the kept tools changes anything on a machine: they find, connect, browse and read.
                tool.ProtocolTool.Annotations ??= new ToolAnnotations();
                tool.ProtocolTool.Annotations.ReadOnlyHint = true;
                tool.ProtocolTool.Annotations.DestructiveHint = false;
                tools.Add(tool);
            }
        }
    }
}
