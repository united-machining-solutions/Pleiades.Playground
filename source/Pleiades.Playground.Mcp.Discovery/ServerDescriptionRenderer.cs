using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Mcp.Discovery;

/// <summary>
/// Inputs for <see cref="ServerDescriptionRenderer.Render(ServerDescription)"/>.
/// </summary>
/// <param name="Title">
/// One-line server title shown as the first paragraph (e.g.
/// <c>"Knowledge Base MCP server for machine-tool documentation (PDF manuals indexed per machine serial number)."</c>).
/// </param>
/// <param name="Domains">
/// Bullet list of high-level domains the server covers (e.g. <c>"Jobs"</c>,
/// <c>"Channels"</c>). Each entry may carry a short colon-separated description
/// — the renderer just emits the strings as-is under the <c>Available domains:</c>
/// header. Pass an empty list to omit the section.
/// </param>
/// <param name="DiscoveryFlow">
/// Numbered steps the LLM should follow on first contact (e.g.
/// <c>"Call kb_get_skill_guide for the full answer-style and safety policy."</c>).
/// Numbering is added by the renderer.
/// </param>
/// <param name="Tools">
/// Names of the tools exposed by this server (e.g. <c>"kb_search"</c>). Numbering
/// is not added; entries appear under the <c>Available tools:</c> header as a
/// bullet list with <c>-</c> markers.
/// </param>
public sealed record ServerDescription(
    string Title,
    IReadOnlyList<string> Domains,
    IReadOnlyList<string> DiscoveryFlow,
    IReadOnlyList<string> Tools);

/// <summary>
/// Renders the standardised <c>*_describe_server</c> tool response shared across all
/// Pleiades MCP servers. The output format is:
/// <code>
/// {Title}
///
/// Available domains:
/// - {domain1}
/// - {domain2}
///
/// Recommended discovery flow:
/// 1. {flowStep1}
/// 2. {flowStep2}
///
/// Available tools:
/// - {tool1}
/// - {tool2}
/// </code>
/// </summary>
public static class ServerDescriptionRenderer
{
    /// <summary>
    /// Render a <see cref="ServerDescription"/> as the multi-line string returned by
    /// the server's <c>*_describe_server</c> MCP tool.
    /// </summary>
    public static string Render(ServerDescription description)
    {
        ArgumentNullException.ThrowIfNull(description);
        if (string.IsNullOrWhiteSpace(description.Title))
        {
            throw new ArgumentException("Title must be a non-empty string.", nameof(description));
        }

        var builder = new StringBuilder();
        builder.Append(description.Title.TrimEnd());
        builder.Append("\n\n");

        if (description.Domains is { Count: > 0 })
        {
            builder.Append("Available domains:\n");
            foreach (var domain in description.Domains)
            {
                builder.Append("- ").Append(domain).Append('\n');
            }
            builder.Append('\n');
        }

        if (description.DiscoveryFlow is { Count: > 0 })
        {
            builder.Append("Recommended discovery flow:\n");
            for (var i = 0; i < description.DiscoveryFlow.Count; i++)
            {
                builder.Append((i + 1).ToString(CultureInfo.InvariantCulture))
                    .Append(". ")
                    .Append(description.DiscoveryFlow[i])
                    .Append('\n');
            }
            builder.Append('\n');
        }

        if (description.Tools is { Count: > 0 })
        {
            builder.Append("Available tools:\n");
            foreach (var tool in description.Tools)
            {
                builder.Append("- ").Append(tool).Append('\n');
            }
        }

        return builder.ToString().TrimEnd() + "\n";
    }
}
