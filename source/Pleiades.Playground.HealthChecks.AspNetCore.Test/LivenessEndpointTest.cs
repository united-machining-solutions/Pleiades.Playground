using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// Pins the wire contract of <c>MapPleiadesLiveness</c>.
/// <para>
/// The endpoint is <c>MapHealthChecks(pattern, new HealthCheckOptions { Predicate = _ =&gt; false })</c>.
/// It keeps the framework's default <c>ResponseWriter</c> (<c>WriteMinimalPlaintext</c>), so the body
/// is the aggregate status as UTF-8 text — <b>not</b> an empty body — and because the predicate
/// filters out every registration the aggregate status is always <c>Healthy</c>, so the response is
/// always <c>200</c>. If either of those is ever changed deliberately, these tests must be updated in
/// the same commit as the code and the CHANGELOG.
/// </para>
/// </summary>
[TestClass]
public class LivenessEndpointTest
{
    private static readonly byte[] ExpectedLivenessBody = Encoding.UTF8.GetBytes("Healthy");

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task Liveness_DefaultPattern_IsSlashHealth()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesLiveness(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var mapped = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);
        var unmapped = await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, mapped.StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, unmapped.StatusCode);
    }

    [TestMethod]
    public async Task Liveness_Returns200WithSevenByteHealthyPlaintextBody()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesLiveness(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var response = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);
        var body = await response.Content.ReadAsByteArrayAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.IsNull(response.Content.Headers.ContentType?.CharSet, "The framework writer sets no charset.");
        Assert.HasCount(7, body, "The body is the 7 ASCII bytes of \"Healthy\", not an empty body.");
        Assert.AreSequenceEqual(ExpectedLivenessBody, body);
    }

    [TestMethod]
    [DataRow(HealthStatus.Unhealthy)]
    [DataRow(HealthStatus.Degraded)]
    public async Task Liveness_IgnoresRegisteredCheck_Returns200AndNeverExecutesIt(HealthStatus registeredStatus)
    {
        var stub = new StubHealthCheck(registeredStatus);
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks().AddCheck("dependency", stub),
            app => app.MapPleiadesLiveness(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var response = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);
        var body = await response.Content.ReadAsByteArrayAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreSequenceEqual(ExpectedLivenessBody, body);
        Assert.AreEqual(0, stub.Invocations, "Predicate = _ => false must filter the registration out entirely.");
    }

    /// <summary>
    /// Executable documentation of the FRAMEWORK rule the liveness contract rests on: an entry-less
    /// <see cref="HealthReport"/> aggregates to <see cref="HealthStatus.Healthy"/>. Nothing here is this
    /// package's behaviour, and the name says so.
    /// </summary>
    /// <remarks>
    /// It used to be called <c>Liveness_Predicate_ProducesEmptyReportThatAggregatesToHealthy</c> and was
    /// presented, here and in the CHANGELOG, as the guard behind "503 is unreachable by construction".
    /// It guarded nothing: it passed its OWN predicate to <c>CheckHealthAsync</c>, so the registered
    /// options were never consulted and deleting <c>Predicate = _ =&gt; false</c> from the extension left
    /// it green - and it then asserted the defaults of a freshly constructed framework
    /// <c>HealthCheckOptions</c>, which no production change can move.
    ///
    /// The observable contract is proved over the wire by
    /// <see cref="Liveness_IgnoresRegisteredCheck_Returns200AndNeverExecutesIt"/>, which registers an
    /// Unhealthy check and asserts the endpoint's own answer. That one is falsifiable; this one is a
    /// note about the framework, kept because the rule is not obvious.
    /// </remarks>
    [TestMethod]
    public async Task Framework_EmptyReport_AggregatesToHealthy()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks().AddCheck("dependency", new StubHealthCheck(HealthStatus.Unhealthy)),
            app => app.MapPleiadesLiveness(),
            TestContext.CancellationToken);

        var service = app.Services.GetRequiredService<HealthCheckService>();
        var report = await service.CheckHealthAsync(_ => false, TestContext.CancellationToken);

        Assert.IsEmpty(report.Entries);
        Assert.AreEqual(HealthStatus.Healthy, report.Status);
    }

    [TestMethod]
    public async Task Liveness_CustomPattern_MapsThereAndNowhereElse()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesLiveness("/alive"),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var custom = await client.GetAsync(new Uri("/alive", UriKind.Relative), TestContext.CancellationToken);
        var defaultPattern = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);

        // Awaited into a local rather than inside the call: AreSequenceEqual binds to its MSTest 4.4
        // ReadOnlySpan<T> overload for byte[], and a span cannot survive an await (CS4007).
        var customBody = await custom.Content.ReadAsByteArrayAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, custom.StatusCode);
        Assert.AreSequenceEqual(ExpectedLivenessBody, customBody);
        Assert.AreEqual(HttpStatusCode.NotFound, defaultPattern.StatusCode);
    }

    /// <remarks>
    /// Named for what it checks. Only one endpoint is mapped here, so the marker lookup has a single
    /// candidate and the assertion would hold whichever builder came back - it is
    /// <c>HealthEndpointMappingTest.MapHealthEndpoints_ReturnsTheDiagnosticsBuilder</c>, which maps
    /// both, that actually discriminates between them.
    /// </remarks>
    [TestMethod]
    public async Task Liveness_AConventionOnTheReturnedBuilder_ReachesTheMappedEndpoint()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesLiveness().WithMetadata(new EndpointMarker()),
            TestContext.CancellationToken);

        Assert.AreEqual("/health", app.FindMarkedRoutePattern());
    }
}
