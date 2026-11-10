using DescriptionAttribute = System.ComponentModel.DescriptionAttribute;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Mcp.Server.Test;

[McpServerToolType]
public sealed class SampleTools
{
    [McpServerTool(Name = "sample_items_query", ReadOnly = true),
     Description("List sample items, paginated.")]
    public static IReadOnlyList<string> QueryItems(
        [Description("Number of items to skip.")] int skip = 0,
        [Description("Maximum number of items to return (1-100).")] int take = 20) =>
        [.. Enumerable.Range(skip, Math.Clamp(take, 1, 100)).Select(i => $"item-{i}")];
}
