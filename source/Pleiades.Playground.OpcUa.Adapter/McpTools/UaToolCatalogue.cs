using System.Text.Json;
using System.Text.Json.Nodes;
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
                if (renamed == AnonymousConnect.ToolName)
                {
                    AnonymousConnect.Strip(tool.ProtocolTool);
                }

                tools.Add(tool);
            }
        }
    }
}

/// <summary>
/// The connect tool of the library, for anonymous sessions only. The library accepts a user name
/// and a password, but a password typed into the chat would go through the language model, and the
/// adapter runs every machine without a user anyway. So the arguments of a user are taken out of the
/// tool (<see cref="Strip"/>), and a call that brings them all the same is refused by a filter of the
/// MCP server before it reaches the tool (<see cref="Filter"/>).
/// </summary>
internal static class AnonymousConnect
{
    /// <summary>The name of the tool on this server.</summary>
    public const string ToolName = "opcua_ua_connect";

    /// <summary>The arguments of the library that carry a user.</summary>
    public static IReadOnlyList<string> UserArguments { get; } = ["authType", "username", "password"];

    /// <summary>What the model reads when it passes a user.</summary>
    public const string Refusal =
        "This adapter opens anonymous sessions only. Never ask the person for a user name or a password, and never " +
        "pass one: a password does not belong in the chat. If the server accepts no anonymous session, tell the " +
        "person that the adapter does not support a user yet.";

    /// <summary>Takes the arguments of a user out of the schema of the connect tool, and says so in its description.</summary>
    public static void Strip(Tool tool)
    {
        ArgumentNullException.ThrowIfNull(tool);
        tool.InputSchema = WithoutUser(tool.InputSchema);
        tool.Description = $"{tool.Description} The session is anonymous: this tool takes no user name and no password.";
    }

    /// <summary>Refuses a call of the connect tool that passes a user, before the tool or a server sees it.</summary>
    public static McpRequestHandler<CallToolRequestParams, CallToolResult> Filter(
        McpRequestHandler<CallToolRequestParams, CallToolResult> next) =>
        (request, cancellationToken) =>
            string.Equals(request.Params?.Name, ToolName, StringComparison.Ordinal) && UserIn(request.Params?.Arguments).Count > 0
                ? ValueTask.FromResult(Refused())
                : next(request, cancellationToken);

    /// <summary>The answer to a call that passes a user.</summary>
    public static CallToolResult Refused() => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = Refusal }],
    };

    /// <summary>
    /// The arguments of a call that carry a user: a user name or a password with any value, and an
    /// <c>authType</c> other than <c>Anonymous</c>. Empty for an anonymous call.
    /// </summary>
    public static IReadOnlyList<string> UserIn(IDictionary<string, JsonElement>? arguments)
    {
        if (arguments is null)
        {
            return [];
        }

        var found = new List<string>();
        foreach (var name in UserArguments)
        {
            var given = arguments.FirstOrDefault(pair => string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase));
            if (given.Key is null || given.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            {
                continue;
            }

            var text = given.Value.ValueKind == JsonValueKind.String ? given.Value.GetString() : given.Value.GetRawText();
            var anonymous = name == "authType" && string.Equals(text, "Anonymous", StringComparison.OrdinalIgnoreCase);
            if (!string.IsNullOrEmpty(text) && !anonymous)
            {
                found.Add(name);
            }
        }

        return found;
    }

    /// <summary>The schema without the arguments of a user, in its properties and among the required ones.</summary>
    public static JsonElement WithoutUser(JsonElement schema)
    {
        if (JsonNode.Parse(schema.GetRawText()) is not JsonObject root)
        {
            return schema;
        }

        if (root["properties"] is JsonObject properties)
        {
            foreach (var name in UserArguments)
            {
                properties.Remove(name);
            }
        }

        if (root["required"] is JsonArray required)
        {
            foreach (var item in required.Where(item => UserArguments.Contains(item?.GetValue<string>(), StringComparer.Ordinal)).ToList())
            {
                required.Remove(item);
            }
        }

        return JsonSerializer.SerializeToElement(root);
    }
}
