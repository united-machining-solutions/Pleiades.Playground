using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// An in-memory MCP server built on the SDK alone, without the Pleiades standard, so a test can break each
/// convention on purpose and prove that <see cref="Testing.McpConformance"/> reports it.
/// </summary>
internal sealed class BareHost : IAsyncDisposable
{
    internal const string Prefix = "bare";

    private BareHost(WebApplication app)
    {
        App = app;
        Client = app.GetTestClient();
    }

    internal WebApplication App { get; }

    internal HttpClient Client { get; }

    /// <param name="instructions">The instructions the server sends, verbatim; <see langword="null"/> sends none.</param>
    /// <param name="tools">The only tools the server registers.</param>
    internal static async Task<BareHost> StartAsync(string? instructions, params McpServerTool[] tools)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        builder.Services
            .AddMcpServer(options => options.ServerInstructions = instructions)
            .WithHttpTransport(transport => transport.SessionMode = HttpServerSessionMode.Stateless)
            .WithTools(tools);

        var app = builder.Build();
        app.MapMcp("/mcp");

        await app.StartAsync();
        return new BareHost(app);
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await App.DisposeAsync();
    }
}
