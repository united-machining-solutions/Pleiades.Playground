using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// Spins up a real ASP.NET Core pipeline on <see cref="TestServer"/> so the tests assert the
/// endpoint contract end-to-end (status code, headers, response bytes) rather than re-implementing
/// what the health-check middleware does.
/// </summary>
internal static class TestApp
{
    /// <summary>
    /// Builds an unstarted app. <paramref name="configureServices"/> must call
    /// <c>AddHealthChecks()</c> itself — one test deliberately omits it.
    /// </summary>
    internal static WebApplication Create(Action<IServiceCollection> configureServices, Action<WebApplication> map)
    {
        // PINNED, and this is not hygiene. With no explicit environment the host reads
        // ASPNETCORE_ENVIRONMENT from the developer's shell; where that is `Development`,
        // WebApplication inserts the developer exception page, the routing failure becomes a 500 HTML
        // response instead of surfacing, and MappingLivenessTwiceOnOnePattern_FailsOnRequestNotAtStartup
        // fails. Reproduced rather than reasoned: `ASPNETCORE_ENVIRONMENT=Development dotnet run` on
        // this suite gives 24/25 with exactly that test red. CI agents have the variable unset, so it
        // is green there and red on a laptop - the least useful shape a failure can take, and the one a
        // developer meets first. Pinning it here also makes the suite state which environment it
        // claims the contract in.
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Production,
        });
        builder.WebHost.UseTestServer();
        configureServices(builder.Services);

        var app = builder.Build();
        map(app);
        return app;
    }

    /// <summary>
    /// A built, unmapped app, so a test can assert around the `Map*` call ALONE rather than around the
    /// builder, the build and the mapping together.
    /// </summary>
    internal static WebApplication CreateWithoutMapping(Action<IServiceCollection> configureServices) =>
        Create(configureServices, _ => { });

    internal static async Task<WebApplication> StartAsync(
        Action<IServiceCollection> configureServices,
        Action<WebApplication> map,
        CancellationToken cancellationToken)
    {
        var app = Create(configureServices, map);
        await app.StartAsync(cancellationToken);
        return app;
    }
}
