using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.HealthChecks.AspNetCore.Test;

/// <summary>
/// Pins the wire contract of <c>MapPleiadesHealthChecks</c>: status codes, content type, and —
/// because the response writer calls <c>WriteAsJsonAsync</c> without explicit options — the fact that
/// the JSON property names are resolved from the <b>consumer's</b> <c>ConfigureHttpJsonOptions</c> at
/// request time, not fixed by this package.
/// </summary>
[TestClass]
public class DiagnosticsEndpointTest
{
    // The pinned property-name sets, one per naming policy. Order matters: it follows the
    // declaration order of the anonymous types in the response writer.
    private static readonly string[] CamelCaseRoot = ["status", "healthChecks", "healthCheckDuration"];
    private static readonly string[] CamelCaseEntry = ["component", "status", "description", "data", "duration"];
    private static readonly string[] PascalCaseRoot = ["Status", "HealthChecks", "HealthCheckDuration"];
    private static readonly string[] PascalCaseEntry = ["Component", "Status", "Description", "Data", "Duration"];
    private static readonly string[] SnakeCaseRoot = ["status", "health_checks", "health_check_duration"];
    private static readonly string[] SnakeCaseEntry = ["component", "status", "description", "data", "duration"];

    public required TestContext TestContext { get; set; }

    private async Task<(HttpStatusCode Status, string? MediaType, JsonDocument Payload)> GetDiagnosticsAsync(
        Action<IServiceCollection> configureServices)
    {
        await using var app = await TestApp.StartAsync(
            configureServices,
            app => app.MapPleiadesHealthChecks(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var response = await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);

        return (response.StatusCode, response.Content.Headers.ContentType?.ToString(), JsonDocument.Parse(body));
    }

    private static string[] PropertyNames(JsonElement element) =>
        [.. element.EnumerateObject().Select(property => property.Name)];

    [TestMethod]
    public async Task Diagnostics_DefaultPattern_IsSlashHealthcheck()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthChecks(),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var mapped = await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);
        var unmapped = await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, mapped.StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, unmapped.StatusCode);
    }

    [TestMethod]
    public async Task Diagnostics_WithSeveralChecks_AggregatesToTheWorstAndListsThemAll()
    {
        // Every other diagnostics case here runs with zero or one entry, so `healthChecks[]` was never
        // exercised as an array - which left both the multi-entry payload shape printed in the README
        // and the Healthy + Unhealthy -> Unhealthy -> 503 aggregation unverified. That aggregation is
        // the case operators actually care about, and it is the shape a real service has.
        var (statusCode, _, payload) = await GetDiagnosticsAsync(
            services => services.AddHealthChecks()
                .AddCheck("mongodb", new StubHealthCheck(HealthStatus.Healthy))
                .AddCheck("broker", new StubHealthCheck(HealthStatus.Unhealthy))
                .AddCheck("opcua", new StubHealthCheck(HealthStatus.Degraded)));

        using (payload)
        {
            Assert.AreEqual(HttpStatusCode.ServiceUnavailable, statusCode,
                "one Unhealthy entry makes the aggregate Unhealthy, whatever the others say");
            Assert.AreEqual(nameof(HealthStatus.Unhealthy),
                payload.RootElement.GetProperty("status").GetString());

            // `component`, not `name` - I assumed the latter and this test said so on its first run,
            // which is the smallest possible instance of the rule it was written under: read the shape,
            // do not infer it.
            var names = payload.RootElement.GetProperty("healthChecks").EnumerateArray()
                .Select(e => e.GetProperty("component").GetString())
                .ToList();

            Assert.HasCount(3, names, "every registered check must appear, not only the failing one");
            Assert.Contains("mongodb", names);
            Assert.Contains("broker", names);
            Assert.Contains("opcua", names);
        }
    }

    [TestMethod]
    public async Task Diagnostics_WhenACheckThrows_PutsTheExceptionMessageOnTheWire()
    {
        // A DISCLOSURE CONTRACT, pinned rather than left to accident. `DefaultHealthCheckService`
        // catches an exception from a check and puts its Message into the entry's Description, which
        // this writer serializes into `description`. So /healthcheck can emit internal exception text -
        // a connection string in a Mongo failure, a hostname, a stack-adjacent message - to anyone who
        // can reach the endpoint.
        //
        // That may be entirely acceptable: the endpoint is for humans and dashboards and is not
        // normally exposed outside the cluster. The point of the test is that it is now a DECISION with
        // a guard, rather than an accident - if the package ever stops disclosing it, this goes red and
        // whoever changed it has to mean it.
        const string secretish = "connect failed: mongodb://user:hunter2@db.internal:27017";

        var (statusCode, _, payload) = await GetDiagnosticsAsync(
            services => services.AddHealthChecks()
                .AddCheck("mongodb", new ThrowingHealthCheck(secretish)));

        using (payload)
        {
            Assert.AreEqual(HttpStatusCode.ServiceUnavailable, statusCode,
                "a check that throws is Unhealthy");

            var entry = payload.RootElement.GetProperty("healthChecks").EnumerateArray().Single();
            Assert.AreEqual(secretish, entry.GetProperty("description").GetString(),
                "the framework puts the exception's Message into Description and this writer serializes "
                + "it, so whatever a check throws is readable on the endpoint");
        }
    }

    [TestMethod]
    [DataRow(HealthStatus.Healthy, (int)HttpStatusCode.OK)]
    [DataRow(HealthStatus.Degraded, (int)HttpStatusCode.OK)]
    [DataRow(HealthStatus.Unhealthy, (int)HttpStatusCode.ServiceUnavailable)]
    public async Task Diagnostics_MapsAggregateStatusToHttpStatusCode(HealthStatus status, int expectedStatusCode)
    {
        var (actualStatusCode, mediaType, payload) = await GetDiagnosticsAsync(
            services => services.AddHealthChecks().AddCheck("dependency", new StubHealthCheck(status)));

        using (payload)
        {
            Assert.AreEqual(expectedStatusCode, (int)actualStatusCode);
            Assert.AreEqual("application/json; charset=utf-8", mediaType);
            Assert.AreEqual(status.ToString(), payload.RootElement.GetProperty("status").GetString());
        }
    }

    [TestMethod]
    public async Task Diagnostics_NoChecksRegistered_Returns200WithEmptyArray()
    {
        var (statusCode, _, payload) = await GetDiagnosticsAsync(services => services.AddHealthChecks());

        using (payload)
        {
            Assert.AreEqual(HttpStatusCode.OK, statusCode);
            Assert.AreEqual("Healthy", payload.RootElement.GetProperty("status").GetString());
            Assert.AreEqual(JsonValueKind.Array, payload.RootElement.GetProperty("healthChecks").ValueKind);
            Assert.AreEqual(0, payload.RootElement.GetProperty("healthChecks").GetArrayLength());
        }
    }

    /// <summary>
    /// The default shape every consumer that does not touch <c>ConfigureHttpJsonOptions</c> gets:
    /// ASP.NET Core's <c>JsonSerializerDefaults.Web</c> camelCase policy applied to the anonymous type
    /// in the response writer. Property order follows the anonymous type's declaration order.
    /// </summary>
    [TestMethod]
    public async Task Diagnostics_DefaultJsonOptions_ProduceCamelCaseNames()
    {
        var data = new Dictionary<string, object> { ["collection"] = "measurements" };
        var (_, _, payload) = await GetDiagnosticsAsync(services => services
            .AddHealthChecks()
            .AddCheck("mongodb", new StubHealthCheck(HealthStatus.Healthy, "MongoDB is reachable.", data)));

        using (payload)
        {
            var root = payload.RootElement;
            Assert.AreSequenceEqual(CamelCaseRoot, PropertyNames(root));

            var entry = root.GetProperty("healthChecks")[0];
            Assert.AreSequenceEqual(CamelCaseEntry, PropertyNames(entry));

            Assert.AreEqual("mongodb", entry.GetProperty("component").GetString());
            Assert.AreEqual("Healthy", entry.GetProperty("status").GetString());
            Assert.AreEqual("MongoDB is reachable.", entry.GetProperty("description").GetString());
            Assert.AreEqual("measurements", entry.GetProperty("data").GetProperty("collection").GetString());
        }
    }

    [TestMethod]
    public async Task Diagnostics_DurationsAreSerializedAsTimeSpanStrings()
    {
        var (_, _, payload) = await GetDiagnosticsAsync(services => services
            .AddHealthChecks()
            .AddCheck("dependency", new StubHealthCheck(HealthStatus.Healthy)));

        using (payload)
        {
            var total = payload.RootElement.GetProperty("healthCheckDuration");
            var entry = payload.RootElement.GetProperty("healthChecks")[0].GetProperty("duration");

            Assert.AreEqual(JsonValueKind.String, total.ValueKind);
            Assert.AreEqual(JsonValueKind.String, entry.ValueKind);
            Assert.IsTrue(TimeSpan.TryParse(total.GetString(), CultureInfo.InvariantCulture, out _));
            Assert.IsTrue(TimeSpan.TryParse(entry.GetString(), CultureInfo.InvariantCulture, out _));
        }
    }

    [TestMethod]
    public async Task Diagnostics_MissingDescription_IsEmittedAsExplicitNull()
    {
        var (_, _, payload) = await GetDiagnosticsAsync(services => services
            .AddHealthChecks()
            .AddCheck("dependency", new StubHealthCheck(HealthStatus.Healthy)));

        using (payload)
        {
            var entry = payload.RootElement.GetProperty("healthChecks")[0];
            Assert.AreEqual(JsonValueKind.Null, entry.GetProperty("description").ValueKind);
        }
    }

    /// <summary>
    /// The payload shape is a function of the consumer's JSON options, because the response writer
    /// calls <c>WriteAsJsonAsync(response)</c> with no explicit <c>JsonSerializerOptions</c> and the
    /// framework then resolves <c>IOptions&lt;JsonOptions&gt;</c> from the request's services. A
    /// consumer that changes the naming policy silently changes this package's response contract.
    /// </summary>
    [TestMethod]
    public async Task Diagnostics_ConsumerJsonOptions_DecidePropertyNames_NullPolicyGivesPascalCase()
    {
        var (_, _, payload) = await GetDiagnosticsAsync(services =>
        {
            services.AddHealthChecks().AddCheck("dependency", new StubHealthCheck(HealthStatus.Healthy));
            services.ConfigureHttpJsonOptions(options => options.SerializerOptions.PropertyNamingPolicy = null);
        });

        using (payload)
        {
            Assert.AreSequenceEqual(PascalCaseRoot, PropertyNames(payload.RootElement));
            Assert.AreSequenceEqual(
                PascalCaseEntry,
                PropertyNames(payload.RootElement.GetProperty("HealthChecks")[0]));
        }
    }

    [TestMethod]
    public async Task Diagnostics_ConsumerJsonOptions_DecidePropertyNames_SnakeCasePolicy()
    {
        var (_, _, payload) = await GetDiagnosticsAsync(services =>
        {
            services.AddHealthChecks().AddCheck("dependency", new StubHealthCheck(HealthStatus.Healthy));
            services.ConfigureHttpJsonOptions(options =>
                options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
        });

        using (payload)
        {
            Assert.AreSequenceEqual(SnakeCaseRoot, PropertyNames(payload.RootElement));
            Assert.AreSequenceEqual(
                SnakeCaseEntry,
                PropertyNames(payload.RootElement.GetProperty("health_checks")[0]));
        }
    }

    [TestMethod]
    public async Task Diagnostics_CustomPattern_MapsThereAndNowhereElse()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthChecks("/diagnostics"),
            TestContext.CancellationToken);
        using var client = app.GetTestClient();

        var custom = await client.GetAsync(new Uri("/diagnostics", UriKind.Relative), TestContext.CancellationToken);
        var defaultPattern = await client.GetAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, custom.StatusCode);
        Assert.AreEqual("application/json; charset=utf-8", custom.Content.Headers.ContentType?.ToString());
        Assert.AreEqual(HttpStatusCode.NotFound, defaultPattern.StatusCode);
    }

    [TestMethod]
    public async Task Diagnostics_ReturnedBuilder_AppliesConventionsToTheDiagnosticsEndpoint()
    {
        await using var app = await TestApp.StartAsync(
            services => services.AddHealthChecks(),
            app => app.MapPleiadesHealthChecks().WithMetadata(new EndpointMarker()),
            TestContext.CancellationToken);

        Assert.AreEqual("/healthcheck", app.FindMarkedRoutePattern());
    }
}
