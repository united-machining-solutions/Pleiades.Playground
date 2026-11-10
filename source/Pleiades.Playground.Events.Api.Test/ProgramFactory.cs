using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Events.Api.Services;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>
/// The real <c>Program</c> in a given environment, without MongoDB: the initializer that creates the indexes
/// at startup is removed, and nothing else touches the database until a request does.
/// </summary>
internal static class ProgramFactory
{
    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "WithWebHostBuilder manages parent factory lifecycle")]
    internal static WebApplicationFactory<Program> Create(string environment, Action<IServiceCollection>? configureTestServices = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);

            // appsettings.Development.json carries the Loki section; Production gets it from the deployment.
            builder.UseSetting("Config:Loki:Sinks:0:Name", "Local");
            builder.UseSetting("Config:Loki:Sinks:0:Enabled", "false");
            builder.UseSetting("Config:Loki:Sinks:0:Uri", "http://localhost:3100");

            // Auth is on by default (fail-closed) and needs Keycloak in Production. These tests check the MCP
            // surface and the host, not the gate, so they run every environment the way an edge install does:
            // Config:Auth:Enabled is the one switch. The gate on /mcp needs a running stack with auth on
            // and is not covered by these tests.
            builder.UseSetting("Config:Auth:Enabled", "false");

            builder.ConfigureTestServices(services =>
            {
                services.Remove(services.Single(d => d.ImplementationType == typeof(MongoDbInitializer)));
                configureTestServices?.Invoke(services);
            });
        });
}
