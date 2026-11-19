using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

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
                if (renamed == ScanConnect.ToolName)
                {
                    ScanConnect.Strip(tool.ProtocolTool);
                }

                tools.Add(tool);
            }
        }
    }
}

/// <summary>
/// The connect tool of the library, without a user from the language model. The library accepts a
/// user name and a password, but a password typed into the chat would go through the model. So the
/// arguments of a user are taken out of the tool (<see cref="Strip"/>), and a call that brings them
/// all the same is refused by a filter of the MCP server before it reaches the tool
/// (<see cref="Filter"/>). If a person stored a user for the server, the filter puts it into the call
/// on the side of the server: the scan logs in as the running machines will, and the model never
/// sees the password.
/// </summary>
internal static class ScanConnect
{
    /// <summary>The name of the tool on this server.</summary>
    public const string ToolName = "opcua_ua_connect";

    /// <summary>The arguments of the library that carry a user.</summary>
    public static IReadOnlyList<string> UserArguments { get; } = ["authType", "username", "password"];

    /// <summary>What the model reads when it passes a user.</summary>
    public const string Refusal =
        "Never pass a user name or a password, and never ask the person for one in the chat: a password does not " +
        "belong in the chat. If the server wants a user, the card of opcua_endpoint_rank asks the person for it; " +
        "once it is stored, this tool logs in with it by itself.";

    /// <summary>Takes the arguments of a user out of the schema of the connect tool, and says so in its description.</summary>
    public static void Strip(Tool tool)
    {
        ArgumentNullException.ThrowIfNull(tool);
        tool.InputSchema = WithoutUser(tool.InputSchema);
        tool.Description =
            $"{tool.Description} This tool takes no user name and no password: if a person stored a user for the server, " +
            "the session logs in with it by itself, else it is anonymous.";
    }

    /// <summary>
    /// Refuses a call of the connect tool that passes a user, before the tool or a server sees it, and
    /// puts the stored user of the server into a call that passes none.
    /// </summary>
    public static McpRequestHandler<CallToolRequestParams, CallToolResult> Filter(
        McpRequestHandler<CallToolRequestParams, CallToolResult> next) =>
        (request, cancellationToken) =>
        {
            if (request.Params is not { } call || !string.Equals(call.Name, ToolName, StringComparison.Ordinal))
            {
                return next(request, cancellationToken);
            }

            var credentials = request.Services?.GetService(typeof(CredentialStore)) as CredentialStore;
            var client = request.Services?.GetService(typeof(OpcUaClient)) as OpcUaClient;
            return CallAsync(
                call,
                credentials is null ? null : credentials.Find,
                client is null ? null : client.GetEndpointsAsync,
                (_, token) => next(request, token),
                cancellationToken);
        };

    /// <summary>
    /// What the filter does with a call of the connect tool: a call that brings a user is refused; a call to a
    /// server with a stored user gets that user, if the server presents the certificate the user was stored with,
    /// and its result loses the password wherever it might be echoed. Every other call goes on as it is.
    /// </summary>
    /// <param name="call">The call of the connect tool.</param>
    /// <param name="findCredential">The stored user of a server address, or null.</param>
    /// <param name="offered">The endpoints a server offers, with their certificates; null to skip the check.</param>
    /// <param name="next">The tool.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    public static async ValueTask<CallToolResult> CallAsync(
        CallToolRequestParams call,
        Func<string, Credential?>? findCredential,
        Func<string, CancellationToken, Task<IReadOnlyList<OfferedEndpoint>>>? offered,
        Func<CallToolRequestParams, CancellationToken, ValueTask<CallToolResult>> next,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(call);
        ArgumentNullException.ThrowIfNull(next);
        if (UserIn(call.Arguments).Count > 0)
        {
            return Refused();
        }

        if (call.Arguments is not { } arguments
            || !arguments.TryGetValue("endpointUrl", out var url)
            || url.ValueKind != JsonValueKind.String
            || findCredential?.Invoke(url.GetString() ?? string.Empty) is not { } credential)
        {
            return WithTrustHint(await next(call, cancellationToken).ConfigureAwait(false), EndpointOf(call.Arguments));
        }

        // The password goes only to the certificate the user was stored with: the scan connects to whatever
        // answers at the address the model chose, and the library accepts every certificate there.
        if (offered is not null)
        {
            var endpoints = await offered(url.GetString()!, cancellationToken).ConfigureAwait(false);
            if (!endpoints.Any(endpoint => credential.Trusts(endpoint.ServerCertificateThumbprint)))
            {
                return CertificateRefused();
            }
        }

        call.Arguments = WithUser(arguments, credential);
        return WithTrustHint(Redacted(await next(call, cancellationToken).ConfigureAwait(false), credential.Password), url.GetString()!);
    }

    /// <summary>
    /// The result of a connect that the server refused because it does not trust the adapter, with what a person
    /// does about it. The library tells only the status (<c>BadSecurityChecksFailed</c>); the model then has the
    /// reason and the remedy to tell the person. Every other result stays as it is.
    /// </summary>
    public static CallToolResult WithTrustHint(CallToolResult result, string url)
    {
        ArgumentNullException.ThrowIfNull(result);
        if (result.IsError != true)
        {
            return result;
        }

        var status = result.Content.OfType<TextContentBlock>()
            .Select(block => UntrustedStatusIn(block.Text))
            .FirstOrDefault(found => found is not null);
        if (status is null)
        {
            return result;
        }

        result.Content = [.. result.Content, new TextContentBlock { Text = OpcUaClient.UntrustedClient(url, status) }];
        return result;
    }

    private static string? UntrustedStatusIn(string text) =>
        new[] { nameof(Opc.Ua.StatusCodes.BadSecurityChecksFailed), nameof(Opc.Ua.StatusCodes.BadCertificateUntrusted) }
            .FirstOrDefault(status => text.Contains(status, StringComparison.Ordinal));

    private static string EndpointOf(IDictionary<string, JsonElement>? arguments) =>
        arguments is not null && arguments.TryGetValue("endpointUrl", out var url) && url.ValueKind == JsonValueKind.String
            ? url.GetString() ?? "this address"
            : "this address";

    /// <summary>What the model reads when the server presents another certificate than the stored user's.</summary>
    public const string CertificateRefusal =
        "The server at this address presents another certificate than the one its user was stored with, so the " +
        "password is not sent. If the certificate was renewed on purpose, a person enters the user again on the card " +
        "of opcua_endpoint_rank.";

    /// <summary>The answer when the certificate of the server is not the one of the stored user.</summary>
    public static CallToolResult CertificateRefused() => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = CertificateRefusal }],
    };

    /// <summary>
    /// The result without the password, wherever a text of the library might echo the arguments, so that the
    /// model never reads it.
    /// </summary>
    public static CallToolResult Redacted(CallToolResult result, string password)
    {
        ArgumentNullException.ThrowIfNull(result);
        if (string.IsNullOrEmpty(password))
        {
            return result;
        }

        foreach (var text in result.Content.OfType<TextContentBlock>())
        {
            text.Text = text.Text.Replace(password, "***", StringComparison.Ordinal);
        }

        if (result.StructuredContent is { } structured && structured.GetRawText().Contains(password, StringComparison.Ordinal))
        {
            result.StructuredContent = JsonSerializer.SerializeToElement(
                JsonNode.Parse(structured.GetRawText().Replace(password, "***", StringComparison.Ordinal)));
        }

        return result;
    }

    /// <summary>
    /// The arguments of a connect call with a stored user: a user name and a password, over an encrypted
    /// endpoint only.
    /// </summary>
    public static Dictionary<string, JsonElement> WithUser(IDictionary<string, JsonElement> arguments, Credential credential)
    {
        ArgumentNullException.ThrowIfNull(arguments);
        ArgumentNullException.ThrowIfNull(credential);
        var withUser = new Dictionary<string, JsonElement>(arguments, StringComparer.Ordinal)
        {
            ["authType"] = JsonSerializer.SerializeToElement("UserName"),
            ["username"] = JsonSerializer.SerializeToElement(credential.User),
            ["password"] = JsonSerializer.SerializeToElement(credential.Password),
            ["securityMode"] = JsonSerializer.SerializeToElement("SignAndEncrypt"),
        };
        return withUser;
    }

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
