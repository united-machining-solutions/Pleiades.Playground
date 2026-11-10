using System.Diagnostics.CodeAnalysis;
using ModelContextProtocol.Client;

namespace Pleiades.Playground.Mcp.Testing;

/// <summary>
/// Connects an MCP client through an existing <see cref="HttpClient"/>, typically the one
/// <c>WebApplicationFactory.CreateClient()</c> returns, so the test talks to the in-memory host.
/// </summary>
public static class McpTestClient
{
    /// <summary>
    /// Connect to the MCP endpoint at <paramref name="path"/> relative to the client's base address.
    /// The caller owns <paramref name="httpClient"/>; disposing the connection does not dispose it.
    /// </summary>
    /// <param name="httpClient">Client of the host under test, with a base address.</param>
    /// <param name="path">Path of the MCP endpoint.</param>
    /// <param name="headers">Extra headers sent with every MCP request, e.g. the <c>X-Forwarded-*</c>
    /// headers a reverse proxy would add.</param>
    /// <param name="cancellationToken">Cancels the connect.</param>
    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope", Justification = "Ownership of the transport moves to the returned connection; on failure it is disposed here.")]
    public static async Task<McpTestConnection> ConnectAsync(
        HttpClient httpClient,
        string path = "/mcp",
        IReadOnlyDictionary<string, string>? headers = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        var baseAddress = httpClient.BaseAddress
            ?? throw new ArgumentException("The HttpClient needs a BaseAddress.", nameof(httpClient));

        var options = new HttpClientTransportOptions { Endpoint = new Uri(baseAddress, path) };
        if (headers is { Count: > 0 })
        {
            options.AdditionalHeaders = new Dictionary<string, string>(headers, StringComparer.OrdinalIgnoreCase);
        }

        var transport = new HttpClientTransport(options, httpClient, loggerFactory: null, ownsHttpClient: false);

        try
        {
            var client = await McpClient.CreateAsync(transport, cancellationToken: cancellationToken).ConfigureAwait(false);
            return new McpTestConnection(client, transport);
        }
        catch
        {
            await transport.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }
}

/// <summary>An MCP client connected for a test, together with the transport it owns.</summary>
public sealed class McpTestConnection : IAsyncDisposable
{
    private readonly HttpClientTransport _transport;

    internal McpTestConnection(McpClient client, HttpClientTransport transport)
    {
        Client = client;
        _transport = transport;
    }

    /// <summary>The connected client.</summary>
    public McpClient Client { get; }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await Client.DisposeAsync().ConfigureAwait(false);
        await _transport.DisposeAsync().ConfigureAwait(false);
    }
}
