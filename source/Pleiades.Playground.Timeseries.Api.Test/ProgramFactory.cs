using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Timeseries.Api.Services.MongoDb;

namespace Pleiades.Playground.Timeseries.Api.Test;

/// <summary>
/// The real <c>Program</c> in a given environment, without MongoDB: the initializer that creates the
/// time-series collections at startup is removed, and nothing else touches the database until a request does.
/// </summary>
internal static class ProgramFactory
{
    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "WithWebHostBuilder manages parent factory lifecycle")]
    internal static WebApplicationFactory<Program> Create(string environment, Action<IServiceCollection>? configureTestServices = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);

            // Auth is on by default (fail-closed) and needs Keycloak in Production. These tests check the MCP
            // surface and the host, not the gate, so they run every environment the way an edge install does:
            // Config:Auth:Enabled is the one switch. The gate on /mcp is proven in the stack, with auth on
            // (ApiAuthorizationViaStackTest).
            builder.UseSetting("Config:Auth:Enabled", "false");

            builder.ConfigureTestServices(services =>
            {
                services.Remove(services.Single(d => d.ImplementationType == typeof(MongoTimeseriesInitializer)));
                configureTestServices?.Invoke(services);
            });
        });
}
