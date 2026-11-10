using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace Pleiades.Playground.Mcp.Testing;

/// <summary>
/// Checks a running MCP server against the Pleiades conventions.
/// </summary>
/// <remarks>
/// Typical use in a server's test project:
/// <code>
/// using var http = factory.CreateClient();
/// var violations = await McpConformance.CheckAsync(http, "uptime", new McpConformanceOptions { RequireRestApi = true }, ct);
/// Assert.AreEqual(0, violations.Count, string.Join(Environment.NewLine, violations));
/// </code>
/// </remarks>
public static partial class McpConformance
{
    /// <summary>Scheme the reverse-proxy check sends as <c>X-Forwarded-Proto</c>.</summary>
    public const string ProxyScheme = "https";

    /// <summary>Host the reverse-proxy check sends as <c>X-Forwarded-Host</c>.</summary>
    public const string ProxyHost = "mcp-conformance.example";

    /// <summary>Path prefix the reverse-proxy check sends as <c>X-Forwarded-Prefix</c>, as Traefik's stripprefix does.</summary>
    public const string ProxyPathPrefix = "/conformance-prefix";

    private static readonly string[] PlumbingParameterNames = ["cancellationToken", "ct", "server", "context", "services"];

    /// <summary>
    /// The full check a server's test project runs: the conventions (<see cref="CheckAsync(McpClient, string, CancellationToken)"/>),
    /// the REST link behind a reverse proxy (<see cref="CheckRestLinkBehindProxyAsync"/>) and the JSON of the
    /// tool/REST pairs the service names (<see cref="CheckRestParityAsync"/>).
    /// Returns every deviation; an empty list means the server conforms.
    /// </summary>
    /// <param name="httpClient">Client of the host under test, e.g. <c>WebApplicationFactory.CreateClient()</c>.</param>
    /// <param name="prefix">Tool-name prefix of the server, e.g. <c>uptime</c>.</param>
    /// <param name="options">Endpoint path and whether a REST link is required.</param>
    /// <param name="cancellationToken">Cancels the check.</param>
    public static async Task<IReadOnlyList<string>> CheckAsync(
        HttpClient httpClient,
        string prefix,
        McpConformanceOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        options ??= new McpConformanceOptions();

        var violations = new List<string>();
        var connection = await McpTestClient.ConnectAsync(httpClient, options.Path, cancellationToken: cancellationToken).ConfigureAwait(false);
        await using (connection.ConfigureAwait(false))
        {
            violations.AddRange(await CheckAsync(connection.Client, prefix, cancellationToken).ConfigureAwait(false));
        }

        violations.AddRange(await CheckRestLinkBehindProxyAsync(httpClient, options, cancellationToken).ConfigureAwait(false));
        violations.AddRange(await CheckRestParityAsync(httpClient, options, cancellationToken).ConfigureAwait(false));
        return violations;
    }

    /// <summary>
    /// Calls each tool of <see cref="McpConformanceOptions.RestParity"/> and its REST request and compares the
    /// parsed JSON: same properties, same values, <see langword="null"/> written or left out alike. Reports the
    /// first difference per pair.
    /// </summary>
    /// <param name="httpClient">Client of the host under test.</param>
    /// <param name="options">Endpoint path and the pairs to compare.</param>
    /// <param name="cancellationToken">Cancels the check.</param>
    public static async Task<IReadOnlyList<string>> CheckRestParityAsync(
        HttpClient httpClient,
        McpConformanceOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        options ??= new McpConformanceOptions();

        var violations = new List<string>();
        if (options.RestParity.Count == 0)
        {
            return violations;
        }

        var connection = await McpTestClient.ConnectAsync(httpClient, options.Path, cancellationToken: cancellationToken).ConfigureAwait(false);
        await using (connection.ConfigureAwait(false))
        {
            foreach (var pair in options.RestParity)
            {
                if (await CompareWithRestAsync(connection.Client, httpClient, pair, cancellationToken).ConfigureAwait(false) is { } violation)
                {
                    violations.Add(violation);
                }
            }
        }

        return violations;
    }

    private static async Task<string?> CompareWithRestAsync(McpClient client, HttpClient httpClient, McpRestPair pair, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(new Uri(pair.RestPath, UriKind.Relative), cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return $"GET {pair.RestPath} answered {(int)response.StatusCode}, so '{pair.ToolName}' has nothing to be compared with.";
        }

        // Report, never throw: one broken pair must not swallow every other violation of the check.
        JsonNode? rest;
        try
        {
            rest = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
        }
        catch (JsonException)
        {
            return $"GET {pair.RestPath} answered no JSON, so '{pair.ToolName}' has nothing to be compared with.";
        }

        CallToolResult result;
        try
        {
            result = await client.CallToolAsync(pair.ToolName, pair.Arguments, cancellationToken: cancellationToken).ConfigureAwait(false);
        }
        catch (McpException e)
        {
            return $"'{pair.ToolName}' could not be called: {e.Message}";
        }

        var text = result.Content.OfType<TextContentBlock>().FirstOrDefault()?.Text;
        if (result.IsError is true)
        {
            return $"'{pair.ToolName}' returned an error: {text}";
        }

        JsonNode? tool;
        try
        {
            tool = JsonNode.Parse(text ?? string.Empty);
        }
        catch (JsonException)
        {
            return $"'{pair.ToolName}' returned no JSON to compare with GET {pair.RestPath}.";
        }

        return FirstDifference(rest, tool, "$") is { } difference
            ? $"'{pair.ToolName}' and GET {pair.RestPath} return different JSON at {difference}."
            : null;
    }

    // The first place where the two documents differ, as "path: what REST has, what MCP has"; null when equal.
    private static string? FirstDifference(JsonNode? rest, JsonNode? mcp, string path)
    {
        switch (rest, mcp)
        {
            case (JsonObject restObject, JsonObject mcpObject):
                foreach (var (name, value) in restObject)
                {
                    if (!mcpObject.TryGetPropertyValue(name, out var mcpValue))
                    {
                        return $"{path}.{name}: REST {Show(value)}, MCP leaves the property out";
                    }

                    if (FirstDifference(value, mcpValue, $"{path}.{name}") is { } inner)
                    {
                        return inner;
                    }
                }

                var extra = mcpObject.FirstOrDefault(p => !restObject.ContainsKey(p.Key));
                return extra.Key is null ? null : $"{path}.{extra.Key}: MCP {Show(extra.Value)}, REST leaves the property out";

            case (JsonArray restArray, JsonArray mcpArray):
                if (restArray.Count != mcpArray.Count)
                {
                    return $"{path}: REST has {restArray.Count} items, MCP {mcpArray.Count}";
                }

                for (var i = 0; i < restArray.Count; i++)
                {
                    if (FirstDifference(restArray[i], mcpArray[i], $"{path}[{i}]") is { } inner)
                    {
                        return inner;
                    }
                }

                return null;

            default:
                return JsonNode.DeepEquals(rest, mcp) ? null : $"{path}: REST {Show(rest)}, MCP {Show(mcp)}";
        }
    }

    private static string Show(JsonNode? node)
    {
        var json = node?.ToJsonString() ?? "null";
        return json.Length <= 80 ? json : string.Concat(json.AsSpan(0, 80), "…");
    }

    /// <summary>
    /// Connects the way Traefik forwards a client (<c>X-Forwarded-Proto</c> <see cref="ProxyScheme"/>,
    /// <c>X-Forwarded-Host</c> <see cref="ProxyHost"/>, <c>X-Forwarded-Prefix</c> <see cref="ProxyPathPrefix"/>)
    /// and checks the REST link in the instructions: it must be absolute, carry exactly that scheme, host
    /// and path prefix, and the path behind the prefix must answer on the service.
    /// </summary>
    /// <param name="httpClient">Client of the host under test.</param>
    /// <param name="options">Endpoint path and whether a REST link is required.</param>
    /// <param name="cancellationToken">Cancels the check.</param>
    public static async Task<IReadOnlyList<string>> CheckRestLinkBehindProxyAsync(
        HttpClient httpClient,
        McpConformanceOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        options ??= new McpConformanceOptions();

        var forwarded = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["X-Forwarded-Proto"] = ProxyScheme,
            ["X-Forwarded-Host"] = ProxyHost,
            ["X-Forwarded-Prefix"] = ProxyPathPrefix,
        };

        string instructions;
        var connection = await McpTestClient.ConnectAsync(httpClient, options.Path, forwarded, cancellationToken).ConfigureAwait(false);
        await using (connection.ConfigureAwait(false))
        {
            instructions = connection.Client.ServerInstructions ?? string.Empty;
        }

        var violations = new List<string>();
        var links = RestLinkPattern().Matches(instructions).Select(m => m.Groups["url"].Value.TrimEnd('.', ',', ';', ')')).ToList();
        if (links.Count == 0)
        {
            if (options.RequireRestApi)
            {
                violations.Add("The instructions carry no REST link, although this test expects the service to serve its OpenAPI document.");
            }

            return violations;
        }

        var expectedBase = $"{ProxyScheme}://{ProxyHost}{ProxyPathPrefix}/";
        foreach (var link in links)
        {
            if (!link.StartsWith(expectedBase, StringComparison.Ordinal))
            {
                violations.Add(
                    $"Behind a reverse proxy the REST link must carry the forwarded scheme, host and path prefix. Called with " +
                    $"X-Forwarded-Proto {ProxyScheme}, X-Forwarded-Host {ProxyHost} and X-Forwarded-Prefix {ProxyPathPrefix}, the instructions " +
                    $"link {link}. Apply the forwarded headers (UsePleiadesForwardedHeaders) before the MCP endpoint is mapped.");
                continue;
            }

            var path = link[(expectedBase.Length - 1)..];
            using var response = await httpClient.GetAsync(new Uri(path, UriKind.Relative), cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                violations.Add($"The REST link {link} does not resolve: GET {path} on the service answered {(int)response.StatusCode}.");
            }
        }

        return violations;
    }

    /// <summary>
    /// Returns every deviation from the conventions; an empty list means the server conforms.
    /// Does not check the REST link behind a reverse proxy; use the <see cref="HttpClient"/> overload for the full check.
    /// </summary>
    public static async Task<IReadOnlyList<string>> CheckAsync(McpClient client, string prefix, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentException.ThrowIfNullOrWhiteSpace(prefix);

        var violations = new List<string>();
        var describeName = $"{prefix}_describe_server";
        var guideName = $"{prefix}_get_skill_guide";

        CheckInstructions(client.ServerInstructions, guideName, violations);

        var tools = await client.ListToolsAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var names = tools.Select(t => t.Name).ToHashSet(StringComparer.Ordinal);

        foreach (var tool in tools)
        {
            CheckTool(tool.ProtocolTool, prefix, violations);
        }

        if (!names.Contains(describeName))
        {
            violations.Add($"Discovery tool '{describeName}' is missing.");
        }
        else
        {
            var describe = await CallForTextAsync(client, describeName, violations, cancellationToken).ConfigureAwait(false);
            if (describe is not null)
            {
                foreach (var missing in names.Where(n => n != describeName && n != guideName && !describe.Contains(n, StringComparison.Ordinal)))
                {
                    violations.Add($"'{describeName}' does not list the registered tool '{missing}'.");
                }

                // The other direction: a tool tools/list hides from this caller must not be named to it either.
                foreach (var hidden in DescribedTools(describe).Where(n => !names.Contains(n)))
                {
                    violations.Add($"'{describeName}' lists the tool '{hidden}', which tools/list does not offer this caller.");
                }
            }
        }

        if (!names.Contains(guideName))
        {
            violations.Add($"Discovery tool '{guideName}' is missing.");
        }
        else
        {
            _ = await CallForTextAsync(client, guideName, violations, cancellationToken).ConfigureAwait(false);
        }

        // A server without any resource does not offer resources/list at all; asking would throw instead of report.
        var resources = client.ServerCapabilities.Resources is null
            ? []
            : await client.ListResourcesAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        if (!resources.Any(r => string.Equals(r.Uri, $"{prefix}://skill", StringComparison.Ordinal)))
        {
            violations.Add($"Resource '{prefix}://skill' is missing.");
        }

        return violations;
    }

    // The "- name" lines after the "Available tools:" line the server standard renders; none for other formats.
    private static IEnumerable<string> DescribedTools(string describe) =>
        describe.Split('\n')
            .SkipWhile(line => !string.Equals(line.TrimEnd(), "Available tools:", StringComparison.Ordinal))
            .Skip(1)
            .Where(line => line.StartsWith("- ", StringComparison.Ordinal))
            .Select(line => line[2..].Trim());

    private static void CheckInstructions(string? instructions, string guideName, List<string> violations)
    {
        if (string.IsNullOrWhiteSpace(instructions))
        {
            violations.Add("The server sends no instructions.");
        }
        else if (!instructions.Contains(guideName, StringComparison.Ordinal))
        {
            violations.Add($"The instructions do not point to '{guideName}'.");
        }
    }

    private static void CheckTool(Tool tool, string prefix, List<string> violations)
    {
        if (!ToolNamePattern().IsMatch(tool.Name) || !tool.Name.StartsWith(prefix + "_", StringComparison.Ordinal))
        {
            violations.Add($"Tool '{tool.Name}' is not named '{prefix}_{{domain}}_{{operation}}' in snake_case.");
        }

        if (string.IsNullOrWhiteSpace(tool.Description))
        {
            violations.Add($"Tool '{tool.Name}' has no description.");
        }

        if (tool.Annotations?.ReadOnlyHint is null)
        {
            violations.Add($"Tool '{tool.Name}' does not declare ReadOnly.");
        }

        if (tool.InputSchema.ValueKind == JsonValueKind.Object
            && tool.InputSchema.TryGetProperty("properties", out var properties)
            && properties.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in properties.EnumerateObject())
            {
                if (PlumbingParameterNames.Contains(property.Name, StringComparer.OrdinalIgnoreCase))
                {
                    violations.Add($"Tool '{tool.Name}' exposes the plumbing parameter '{property.Name}' in its input schema.");
                }
            }
        }
    }

    private static async Task<string?> CallForTextAsync(McpClient client, string toolName, List<string> violations, CancellationToken cancellationToken)
    {
        var result = await client.CallToolAsync(toolName, cancellationToken: cancellationToken).ConfigureAwait(false);
        var text = result.Content.OfType<TextContentBlock>().FirstOrDefault()?.Text;

        if (result.IsError is true)
        {
            violations.Add($"'{toolName}' returned an error: {text}");
            return null;
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            violations.Add($"'{toolName}' returned no text.");
            return null;
        }

        return text;
    }

    // The REST line the server standard renders: "REST API: ... described at <absolute url>; ...".
    [GeneratedRegex(@"REST API:[^\n]*?(?<url>https?://[^\s;]+)", RegexOptions.CultureInvariant)]
    private static partial Regex RestLinkPattern();

    [GeneratedRegex("^[a-z][a-z0-9]*(_[a-z0-9]+)+$", RegexOptions.CultureInvariant)]
    private static partial Regex ToolNamePattern();
}
