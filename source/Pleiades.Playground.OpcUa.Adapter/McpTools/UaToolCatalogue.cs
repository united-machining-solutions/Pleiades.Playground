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
/// The connect tool of the library, with the security and the identity the adapter decides, not the language
/// model. The library accepts a user name and a password, but a password typed into the chat would go through
/// the model. So the arguments of a user are taken out of the tool (<see cref="Strip"/>), and a call that brings
/// them all the same is refused by a filter of the MCP server before it reaches the tool (<see cref="Filter"/>).
/// The filter sets the security of the endpoint the adapter takes, the strongest or the one a person chose. Where a
/// person stored a user and that endpoint is encrypted and takes a user name, it puts the user into the call, on the
/// side of the server: the model never sees the password. Else the session is anonymous.
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
            $"{tool.Description} This tool takes no user name and no password, and the adapter sets the security: the " +
            "endpoint opcua_endpoint_rank recommends, the strongest or the one a person chose. If a person stored a user, the " +
            "session logs in with it by itself; else it is anonymous. Connecting again with the same name replaces the session.";
    }

    /// <summary>
    /// Refuses a call of the connect tool that passes a user, before the tool or a server sees it, and gives a call
    /// that passes none the security and the identity of the adapter.
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
            var supervisor = request.Services?.GetService(typeof(MachineSupervisor)) as MachineSupervisor;
            return CallAsync(
                call,
                credentials is null ? null : credentials.Find,
                supervisor is null ? null : supervisor.OfferAsync,
                supervisor is null ? null : supervisor.RefusesAnonymousAsync,
                (_, token) => next(request, token),
                cancellationToken);
        };

    /// <summary>
    /// What the filter does with a call of the connect tool. A call that brings a user is refused. Every other call
    /// gets the security of the endpoint the adapter takes. On that endpoint the session logs in with the stored user
    /// if the endpoint is encrypted and takes a user name; else it is anonymous, and if the server refuses that, the
    /// user logs in on an encrypted endpoint. A user goes only to the certificate it was stored with, and the result
    /// loses the password wherever it might be echoed.
    /// </summary>
    /// <param name="call">The call of the connect tool.</param>
    /// <param name="findCredential">The stored user of a server address, or null.</param>
    /// <param name="offerOf">The endpoints of a server with the user and the security a person stored; null to pass the call on as it is.</param>
    /// <param name="refusesAnonymous">Whether the server refuses an anonymous session on an endpoint; null to try none.</param>
    /// <param name="next">The tool.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    public static async ValueTask<CallToolResult> CallAsync(
        CallToolRequestParams call,
        Func<string, Credential?>? findCredential,
        Func<string, CancellationToken, Task<EndpointOffer>>? offerOf,
        Func<string, OfferedEndpoint, CancellationToken, Task<bool>>? refusesAnonymous,
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
            || !arguments.TryGetValue("endpointUrl", out var given)
            || given.ValueKind != JsonValueKind.String
            || given.GetString() is not { Length: > 0 } url
            || offerOf is null)
        {
            return WithTrustHint(await next(call, cancellationToken).ConfigureAwait(false), EndpointOf(call.Arguments));
        }

        EndpointOffer offer;
        try
        {
            offer = await offerOf(url, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (Api.MachineEndpoints.IsServerFault(exception))
        {
            // The server does not answer the adapter either: the library says so in its own words.
            return WithTrustHint(await next(call, cancellationToken).ConfigureAwait(false), url);
        }

        if (offer.Used is not { } used)
        {
            return offer.NeedsUser && offer.User is null
                ? Failed(NeedsUserText)
                : WithTrustHint(await next(call, cancellationToken).ConfigureAwait(false), url);
        }

        var credential = findCredential?.Invoke(url);
        if (!used.WithUser)
        {
            // An endpoint the user cannot take, or no user stored: anonymous. With no user stored there is nothing to
            // fall back to, so nothing is tried before.
            var anonymous = credential is null
                || refusesAnonymous is null
                || !await refusesAnonymous(url, used.Endpoint, cancellationToken).ConfigureAwait(false);
            if (anonymous)
            {
                call.Arguments = Anonymous(WithSecurity(arguments, used.Endpoint));
                return WithTrustHint(await next(call, cancellationToken).ConfigureAwait(false), url, used.Endpoint);
            }

            if (offer.UserEndpointAfter(used) is not { } withUser)
            {
                return Failed(AnonymousRefusedText);
            }

            used = withUser;
        }

        if (credential is null)
        {
            return Failed(NeedsUserText);
        }

        // The password goes only to the certificate the user was stored with: the scan connects to whatever
        // answers at the address the model chose, and the library accepts every certificate there.
        if (!credential.Trusts(used.Endpoint.ServerCertificateThumbprint))
        {
            return CertificateRefused();
        }

        call.Arguments = WithUser(WithSecurity(arguments, used.Endpoint), credential);
        return WithTrustHint(Redacted(await next(call, cancellationToken).ConfigureAwait(false), credential.Password), url, used.Endpoint);
    }

    /// <summary>What the model reads when the server takes no session without a user, and no user is stored.</summary>
    public const string NeedsUserText =
        "The server takes no session without a user, and no person stored one for it. The card of opcua_endpoint_rank asks the " +
        "person for user name and password; never ask for them in the chat. Call opcua_endpoint_rank, and wait until the person says it is done.";

    /// <summary>What the model reads when the server refused an anonymous session, and offers the stored user no encrypted endpoint.</summary>
    public const string AnonymousRefusedText =
        "The server refused an anonymous session, and offers no encrypted endpoint for the user a person stored. The adapter cannot " +
        "connect to it: tell the person.";

    private static CallToolResult Failed(string text) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = text }],
    };

    /// <summary>
    /// The arguments of a connect call with the security of <paramref name="endpoint"/>. The policy goes by its short
    /// name, <c>Basic256Sha256</c>: the library matches only that, although its tool says "Policy URI"; with the URI no
    /// endpoint matches (<c>BadNotFound</c>).
    /// </summary>
    public static Dictionary<string, JsonElement> WithSecurity(IDictionary<string, JsonElement> arguments, OfferedEndpoint endpoint)
    {
        ArgumentNullException.ThrowIfNull(arguments);
        ArgumentNullException.ThrowIfNull(endpoint);
        return new Dictionary<string, JsonElement>(arguments, StringComparer.Ordinal)
        {
            ["securityMode"] = JsonSerializer.SerializeToElement(endpoint.SecurityMode.ToString()),
            ["securityPolicy"] = JsonSerializer.SerializeToElement(endpoint.SecurityPolicy),
        };
    }

    /// <summary>The arguments of an anonymous connect call.</summary>
    public static Dictionary<string, JsonElement> Anonymous(IDictionary<string, JsonElement> arguments)
    {
        ArgumentNullException.ThrowIfNull(arguments);
        return new Dictionary<string, JsonElement>(arguments, StringComparer.Ordinal)
        {
            ["authType"] = JsonSerializer.SerializeToElement("Anonymous"),
        };
    }

    /// <summary>
    /// The result of a connect that the server refused (<c>BadSecurityChecksFailed</c>, <c>BadCertificateUntrusted</c>),
    /// with the likely cause and what a person does about it: trust the certificate of the adapter, or, if the server
    /// says it cannot handle the security of the endpoint, choose another one. The library gives the status and the
    /// words of the server; the model then has the cause and the remedy to tell the person. Every other result stays
    /// as it is.
    /// </summary>
    /// <param name="result">The result of the connect tool.</param>
    /// <param name="url">The address of the server.</param>
    /// <param name="security">The endpoint the connect used, or null if the adapter did not set it.</param>
    public static CallToolResult WithTrustHint(CallToolResult result, string url, OfferedEndpoint? security = null)
    {
        ArgumentNullException.ThrowIfNull(result);
        var texts = result.Content.OfType<TextContentBlock>().Select(block => block.Text).ToList();

        // The library reports a failed connect as JSON with "error": true, without setting IsError.
        if (result.IsError != true && !texts.Any(ReportsError))
        {
            return result;
        }

        var refusal = texts.Select(RefusalIn).FirstOrDefault(found => found is not null);
        if (refusal is not var (status, reason))
        {
            return result;
        }

        var hint = OpcUaClient.RefusedClient(
            url, status, reason, security is null ? null : $"{security.SecurityMode} with {security.SecurityPolicy}");
        result.Content = [.. result.Content, new TextContentBlock { Text = hint }];
        result.IsError = true;
        return result;
    }

    /// <summary>Whether a text of a tool result is the JSON of a failure of the library: <c>"error": true</c>.</summary>
    private static bool ReportsError(string text)
    {
        try
        {
            using var json = JsonDocument.Parse(text);
            return json.RootElement.ValueKind == JsonValueKind.Object
                && json.RootElement.TryGetProperty("error", out var error)
                && error.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>The status of a refusal in the text of a tool result, with the words of the server, if it is one.</summary>
    private static (string Status, string? Reason)? RefusalIn(string text)
    {
        var status = new[] { nameof(Opc.Ua.StatusCodes.BadSecurityChecksFailed), nameof(Opc.Ua.StatusCodes.BadCertificateUntrusted) }
            .FirstOrDefault(status => text.Contains(status, StringComparison.Ordinal));
        return status is null ? null : (status, RefusalPolicy.ReasonIn(MessageIn(text), status, quotedOnly: true));
    }

    /// <summary>The <c>message</c> of a tool result the library wrote as JSON, else the text as it is.</summary>
    private static string MessageIn(string text)
    {
        try
        {
            using var json = JsonDocument.Parse(text);
            return json.RootElement.ValueKind == JsonValueKind.Object
                && json.RootElement.TryGetProperty("message", out var message)
                && message.ValueKind == JsonValueKind.String
                ? message.GetString() ?? text
                : text;
        }
        catch (JsonException)
        {
            return text;
        }
    }

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
