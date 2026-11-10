using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>A minimal in-memory service hosting a Pleiades MCP server, as a real API would.</summary>
internal sealed class SampleHost : IAsyncDisposable
{
    internal const string Prefix = "sample";

    private SampleHost(WebApplication app)
    {
        App = app;
        Client = app.GetTestClient();
    }

    internal WebApplication App { get; }

    internal HttpClient Client { get; }

    /// <param name="mapOpenApi">Serve an OpenAPI document under the route <c>MapOpenApi()</c> uses.</param>
    /// <param name="configure">Adjusts the server options.</param>
    /// <param name="useForwardedHeaders">Apply the X-Forwarded-* headers like a service behind Traefik
    /// (<c>UsePleiadesForwardedHeaders</c> in the real services).</param>
    /// <param name="tools">Registers further tools next to <see cref="SampleTools"/>.</param>
    /// <param name="logs">An extra logger provider, e.g. to collect the startup warnings.</param>
    /// <param name="services">Further service registrations, e.g. the HTTP JSON options.</param>
    /// <param name="endpoints">Further endpoints, e.g. the REST twin of a tool.</param>
    internal static async Task<SampleHost> StartAsync(
        bool mapOpenApi,
        Action<PleiadesMcpServerOptions>? configure = null,
        bool useForwardedHeaders = true,
        Action<IMcpServerBuilder>? tools = null,
        ILoggerProvider? logs = null,
        Action<IServiceCollection>? services = null,
        Action<WebApplication>? endpoints = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        if (logs is not null)
        {
            builder.Logging.AddProvider(logs);
        }

        services?.Invoke(builder.Services);

        var mcp = builder.Services
            .AddPleiadesMcpServer(options =>
            {
                options.Prefix = Prefix;
                options.Title = "Sample MCP server for the Pleiades.Playground.Mcp.Server tests.";
                options.Domains.Add("Sample items");
                options.DiscoveryFlow.Add("Call sample_items_query to list items.");
                options.ServerAssembly = typeof(SampleHost).Assembly;
                configure?.Invoke(options);
            })
            .WithPleiadesTools<SampleTools>();
        tools?.Invoke(mcp);

        var app = builder.Build();

        if (useForwardedHeaders)
        {
            var forwarded = new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
                    | ForwardedHeaders.XForwardedHost | ForwardedHeaders.XForwardedPrefix,
            };
            forwarded.KnownIPNetworks.Clear();
            forwarded.KnownProxies.Clear();
            app.UseForwardedHeaders(forwarded);
        }

        if (mapOpenApi)
        {
            // Same route pattern MapOpenApi() registers, without pulling in Microsoft.AspNetCore.OpenApi.
            app.MapGet("/openapi/{documentName}.json", (string documentName) => Results.Json(new { openapi = "3.1.1", documentName }));
        }

        endpoints?.Invoke(app);
        app.MapPleiadesMcp();

        await app.StartAsync();
        return new SampleHost(app);
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await App.DisposeAsync();
    }
}
