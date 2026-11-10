using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// Tools registered with <see cref="PleiadesMcpServerBuilderExtensions"/> serialize with the service's HTTP JSON
/// options, so a tool returns the same JSON as the service's REST endpoint.
/// </summary>
[TestClass]
public sealed class HttpJsonOptionsTests
{
    private static readonly McpRestPair GaugePair = new("sample_gauges_get_by_id", new Dictionary<string, object?> { ["id"] = "g1" }, "/gauges/g1");

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ConverterRegisteredForHttpOnly_AppliesToTheToolResult()
    {
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(), ignoreNulls: false);

        var gauge = await CallGaugeToolAsync(host);

        Assert.AreEqual("21.5C", gauge["temperature"]?.GetValue<string>(), gauge.ToJsonString());
    }

    [TestMethod]
    [DataRow(false, DisplayName = "REST writes null")]
    [DataRow(true, DisplayName = "REST leaves null out")]
    public async Task NullProperties_AreWrittenOrLeftOutAsRestDoes(bool ignoreNulls)
    {
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(), ignoreNulls);
        var options = new McpConformanceOptions { RestParity = { GaugePair } };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);
        var gauge = await CallGaugeToolAsync(host);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
        Assert.AreEqual(!ignoreNulls, gauge.ContainsKey("note"), gauge.ToJsonString());
    }

    [TestMethod]
    public async Task OwnOptions_ReplaceTheHttpOptions()
    {
        // Opt-out for a service whose HTTP options do not suit MCP: these options know no converter.
        var own = new JsonSerializerOptions(JsonSerializerDefaults.Web) { TypeInfoResolver = new DefaultJsonTypeInfoResolver() };
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(own), ignoreNulls: true);

        var gauge = await CallGaugeToolAsync(host);

        Assert.AreEqual(21.5, gauge["temperature"]?["value"]?.GetValue<double>(), gauge.ToJsonString());
        Assert.IsTrue(gauge.ContainsKey("note"), "The own options write null; the HTTP options would have left it out.");
    }

    [TestMethod]
    public async Task ToolsRegisteredWithTheSdkAlone_DifferFromRest_AndTheParityCheckSaysWhere()
    {
        // The state without that registration: the SDK defaults know neither the converter nor the null rule of REST.
        await using var host = await StartAsync(mcp => mcp.WithTools<GaugeTools>(), ignoreNulls: false);
        var options = new McpConformanceOptions { RestParity = { GaugePair } };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);

        Assert.AreEqual(
            "'sample_gauges_get_by_id' and GET /gauges/g1 return different JSON at $.temperature: REST \"21.5C\", MCP {\"value\":21.5}.",
            Assert.ContainsSingle(violations));
    }

    [TestMethod]
    [DataRow("sample_gauges_get_by_id", "/gauges-without-note/g1", "$.note: MCP null, REST leaves the property out", DisplayName = "MCP writes a property REST leaves out")]
    [DataRow("sample_gauges_list", "/gauges", "$: REST has 3 items, MCP 2", DisplayName = "Lists of different length")]
    [DataRow("sample_gauges_list", "/gauges-renamed", "$[1].id: REST \"g9\", MCP \"g2\"", DisplayName = "A value inside a list")]
    public async Task RestParity_ReportsTheFirstDifference(string tool, string restPath, string difference)
    {
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(), ignoreNulls: false);
        var arguments = tool == GaugePair.ToolName ? GaugePair.Arguments : new Dictionary<string, object?>();
        var options = new McpConformanceOptions { RestParity = { new McpRestPair(tool, arguments, restPath) } };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);

        Assert.AreEqual($"'{tool}' and GET {restPath} return different JSON at {difference}.", Assert.ContainsSingle(violations));
    }

    [TestMethod]
    public async Task RestParity_RestRequestFails_IsReported()
    {
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(), ignoreNulls: false);
        var options = new McpConformanceOptions { RestParity = { GaugePair with { RestPath = "/gauges-missing/g1" } } };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);

        Assert.AreEqual(
            "GET /gauges-missing/g1 answered 404, so 'sample_gauges_get_by_id' has nothing to be compared with.",
            Assert.ContainsSingle(violations));
    }

    [TestMethod]
    public async Task RestParity_BrokenPairs_AreReported_AndTheOthersStillChecked()
    {
        // A twin that answers no JSON, a mistyped tool, and a sound pair: the first two must not abort the check.
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<GaugeTools>(), ignoreNulls: false);
        var options = new McpConformanceOptions
        {
            RestParity =
            {
                GaugePair with { RestPath = "/gauges-text/g1" },
                GaugePair with { ToolName = "sample_gauges_typo" },
                GaugePair with { RestPath = "/gauges-without-note/g1" },
            },
        };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);

        Assert.HasCount(3, violations, string.Join(Environment.NewLine, violations));
        Assert.AreEqual("GET /gauges-text/g1 answered no JSON, so 'sample_gauges_get_by_id' has nothing to be compared with.", violations[0]);
        Assert.StartsWith("'sample_gauges_typo' could not be called: ", violations[1], StringComparison.Ordinal);
        Assert.StartsWith("'sample_gauges_get_by_id' and GET /gauges-without-note/g1 return different JSON", violations[2], StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task InstanceTools_AreCreatedPerCall_WithTheHttpOptions()
    {
        await using var host = await StartAsync(mcp => mcp.WithPleiadesTools<InstanceGaugeTools>(), ignoreNulls: false);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var result = await connection.Client.CallToolAsync(
            "sample_gauges_latest", cancellationToken: TestContext.CancellationToken);

        var gauge = JsonNode.Parse(result.Content.OfType<TextContentBlock>().Single().Text)!.AsObject();
        Assert.AreEqual("21.5C", gauge["temperature"]?.GetValue<string>(), gauge.ToJsonString());
    }

    private static Task<SampleHost> StartAsync(Action<IMcpServerBuilder> tools, bool ignoreNulls) =>
        SampleHost.StartAsync(
            mapOpenApi: false,
            tools: tools,
            services: services => services
                .AddSingleton<GaugeSource>()
                .ConfigureHttpJsonOptions(json =>
                {
                    json.SerializerOptions.Converters.Add(new CelsiusConverter());
                    json.SerializerOptions.DefaultIgnoreCondition = ignoreNulls ? JsonIgnoreCondition.WhenWritingNull : JsonIgnoreCondition.Never;
                }),
            endpoints: app =>
            {
                app.MapGet("/gauges/{id}", (string id) => TypedResults.Ok(GaugeStore.Get(id)));

                // Deliberately different twins, to see the parity check report each kind of difference.
                app.MapGet("/gauges-without-note/{id}", (string id) => TypedResults.Ok(new { id, temperature = GaugeStore.Get(id).Temperature }));
                app.MapGet("/gauges", () => TypedResults.Ok(new[] { GaugeStore.Get("g1"), GaugeStore.Get("g2"), GaugeStore.Get("g3") }));
                app.MapGet("/gauges-renamed", () => TypedResults.Ok(new[] { GaugeStore.Get("g1"), GaugeStore.Get("g9") }));
                app.MapGet("/gauges-text/{id}", (string id) => TypedResults.Text($"gauge {id}"));
            });

    private async Task<JsonObject> CallGaugeToolAsync(SampleHost host)
    {
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);
        var result = await connection.Client.CallToolAsync(
            GaugePair.ToolName, GaugePair.Arguments, cancellationToken: TestContext.CancellationToken);
        return JsonNode.Parse(result.Content.OfType<TextContentBlock>().Single().Text)!.AsObject();
    }

    /// <summary>A service the instance tool takes from DI, to prove the factory resolves it per call.</summary>
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI.")]
    internal sealed class GaugeSource
    {
        internal string LatestId { get; } = "latest";
    }

    [McpServerToolType]
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated per call by the tool factory.")]
    internal sealed class InstanceGaugeTools(GaugeSource source)
    {
        [McpServerTool(Name = "sample_gauges_latest", ReadOnly = true),
         System.ComponentModel.Description("The latest gauge.")]
        public Gauge Latest() => GaugeStore.Get(source.LatestId);
    }
}
