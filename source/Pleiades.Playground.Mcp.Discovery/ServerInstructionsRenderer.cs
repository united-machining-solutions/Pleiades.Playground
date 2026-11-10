using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Mcp.Discovery;

/// <summary>
/// Renders the spec-native MCP <c>instructions</c> text (sent with the <c>initialize</c> result and,
/// from protocol revision 2026-07-28 on, with the <c>server/discover</c> result).
/// </summary>
/// <remarks>
/// Clients typically put this text into the model's system context on connect, without a tool call;
/// with deferred tool loading it is often the only part of a server the model sees up front. It
/// therefore carries what no single tool description can: what the server is for, where the full
/// guide is, that the same data is reachable over REST, and the recommended workflow.
/// <para>
/// Order matters because clients cut the text: Claude Code truncates at
/// <see cref="RecommendedMaxLength"/> characters per server, and OpenAI advises keeping the essentials
/// in the first <see cref="EssentialsLength"/>. Title, guide pointer and REST pointer come first;
/// domains and discovery flow follow. Following the spec guidance the text does <b>not</b> repeat the
/// tool list, which <c>tools/list</c> already carries, so <see cref="ServerDescription.Tools"/> is ignored.
/// </para>
/// </remarks>
public static class ServerInstructionsRenderer
{
    /// <summary>Length above which Claude Code truncates server instructions.</summary>
    public const int RecommendedMaxLength = 2048;

    /// <summary>Length within which the essentials (title, guide pointer, REST pointer) should fit.</summary>
    public const int EssentialsLength = 512;

    /// <summary>
    /// Render the instructions for a server whose tools share <paramref name="prefix"/>.
    /// </summary>
    /// <param name="description">Title, domains and discovery flow of the server.</param>
    /// <param name="prefix">Tool-name prefix, e.g. <c>uptime</c>; names the skill-guide tool and resource.</param>
    /// <param name="restApi">The REST API of the same service, or <see langword="null"/> when the
    /// deployment publishes no OpenAPI document. The REST line is omitted in that case, so the text
    /// never advertises a link that does not resolve.</param>
    public static string Render(ServerDescription description, string prefix, RestApiReference? restApi)
    {
        ArgumentNullException.ThrowIfNull(description);
        ArgumentException.ThrowIfNullOrWhiteSpace(prefix);
        if (string.IsNullOrWhiteSpace(description.Title))
        {
            throw new ArgumentException("Title must be a non-empty string.", nameof(description));
        }

        var builder = new StringBuilder();
        builder.Append(description.Title.TrimEnd()).Append('\n');
        // Conditional: some hosts paste the guide into the system prompt on connect and still offer the tool.
        builder.Append("Full guide: if it is not already in your context, call ").Append(prefix)
            .Append("_get_skill_guide or read the resource ").Append(prefix).Append("://skill.\n");

        if (restApi is not null)
        {
            // An offer, not an instruction: the tools stay the default.
            builder.Append("REST API: described at ")
                .Append(restApi.OpenApiDocument.AbsoluteUri)
                .Append("; it accepts the same credentials as this MCP endpoint. ")
                .Append("If you can send HTTP requests yourself, you may use it for bulk reads and operations no tool offers; the tools stay the default.\n");
        }

        if (description.Domains is { Count: > 0 })
        {
            builder.Append("\nAvailable domains:\n");
            foreach (var domain in description.Domains)
            {
                builder.Append("- ").Append(domain).Append('\n');
            }
        }

        if (description.DiscoveryFlow is { Count: > 0 })
        {
            builder.Append("\nRecommended discovery flow:\n");
            for (var i = 0; i < description.DiscoveryFlow.Count; i++)
            {
                builder.Append((i + 1).ToString(CultureInfo.InvariantCulture))
                    .Append(". ")
                    .Append(description.DiscoveryFlow[i])
                    .Append('\n');
            }
        }

        return builder.ToString();
    }
}
