using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// Pins how the two endpoints are wired: the combined helper, which endpoint its return value
/// configures, and the two startup/runtime failures a consumer can walk into.
/// </summary>
[TestClass]
public class HealthEndpointMappingTest
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task MapHealthEndpoints_MapsLivenessAndDiagnosticsOnTheirDefaultPatterns()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthEndpoints(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var liveness = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);
        var diagnostics = await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);

        // The await is hoisted out of the argument list on purpose. MSTest 4.4 gave AreSequenceEqual a
        // ReadOnlySpan<T> overload which now wins for byte[], and a span cannot be kept across an await
        // - awaiting INSIDE the call is CS4007, reported on the assertion rather than on the await.
        var livenessBody = await liveness.Content.ReadAsByteArrayAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, liveness.StatusCode);
        Assert.AreEqual("text/plain", liveness.Content.Headers.ContentType?.MediaType);
        Assert.AreSequenceEqual(Encoding.UTF8.GetBytes("Healthy"), livenessBody);

        Assert.AreEqual(HttpStatusCode.OK, diagnostics.StatusCode);
        Assert.AreEqual("application/json; charset=utf-8", diagnostics.Content.Headers.ContentType?.ToString());
    }

    [TestMethod]
    public async Task MapHealthEndpoints_CustomPatterns_MapBothAndLeaveTheDefaultsUnmapped()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthEndpoints("/alive", "/diagnostics"),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        Assert.AreEqual(
            HttpStatusCode.OK,
            (await client.GetAsync(new Uri("/alive", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(
            HttpStatusCode.OK,
            (await client.GetAsync(new Uri("/diagnostics", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(
            HttpStatusCode.NotFound,
            (await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(
            HttpStatusCode.NotFound,
            (await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
    }

    /// <summary>
    /// The combined helper returns the <i>diagnostics</i> builder, so a consumer chaining conventions
    /// onto it configures <c>/healthcheck</c> and not the liveness endpoint.
    /// </summary>
    [TestMethod]
    public async Task MapHealthEndpoints_ReturnsTheDiagnosticsBuilder()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthEndpoints().WithMetadata(new EndpointMarker()),
            TestContext.CancellationToken);

        Assert.AreEqual("/healthcheck", app.FindMarkedRoutePattern());
    }

    /// <summary>
    /// The documented upgrade hazard: a consumer that keeps its hand-written
    /// <c>MapHealthChecks("/health", …)</c> line <i>and</i> adopts the helper registers two endpoints
    /// on one pattern. Routing only notices on the first request, not at startup.
    /// </summary>
    [TestMethod]
    public async Task MappingLivenessTwiceOnOnePattern_FailsOnRequestNotAtStartup()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app =>
            {
                app.MapHealthChecks("/health", new HealthCheckOptions { Predicate = _ => false });
                app.MapPleiadesLiveness();
            },
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var exception = await Assert.ThrowsAsync<Exception>(
            () => client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken));

        // The full type name identifies it unambiguously. The message text used to be asserted too;
        // that pinned ASP.NET Core's wording, which adds nothing over the type and turns a framework
        // rewording into a red build here.
        Assert.AreEqual(
            "Microsoft.AspNetCore.Routing.Matching.AmbiguousMatchException",
            exception.GetType().FullName,
            "Routing's AmbiguousMatchException is internal, so it can only be asserted by name.");
    }

    /// <remarks>
    /// The app is built FIRST and the assertion wraps the `Map*` call alone. It used to wrap
    /// `CreateSlimBuilder()`, `UseTestServer()`, `Build()` and `Map*()` together, so any
    /// <see cref="InvalidOperationException"/> from any of the four satisfied it - while the claim
    /// being made, here and in the CHANGELOG, is specifically that it throws **at map time**. That is
    /// the useful half: a consumer finds out at startup rather than on a first request. The message
    /// check keeps an unrelated InvalidOperationException from passing as this contract.
    /// </remarks>
    [TestMethod]
    public void MapDiagnostics_WithoutAddHealthChecks_ThrowsWhenMapping()
    {
        using var app = TestApp.CreateWithoutMapping(_ => { });

        var exception = Assert.ThrowsExactly<InvalidOperationException>(
            () => app.MapPleiadesHealthChecks());

        Assert.Contains("AddHealthChecks", exception.Message, StringComparison.Ordinal);
    }

    /// <inheritdoc cref="MapDiagnostics_WithoutAddHealthChecks_ThrowsWhenMapping" />
    [TestMethod]
    public void MapLiveness_WithoutAddHealthChecks_ThrowsWhenMapping()
    {
        using var app = TestApp.CreateWithoutMapping(_ => { });

        var exception = Assert.ThrowsExactly<InvalidOperationException>(
            () => app.MapPleiadesLiveness());

        Assert.Contains("AddHealthChecks", exception.Message, StringComparison.Ordinal);
    }
}
