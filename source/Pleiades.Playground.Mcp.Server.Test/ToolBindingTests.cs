using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// Tools bind their arguments as leniently as the SDK defaults although they serialize with the service's
/// HTTP JSON options.
/// </summary>
/// <remarks>
/// <c>AddPleiadesHttpJsonOptions</c> sets <c>NumberHandling = AllowNamedFloatingPointLiterals</c>,
/// which drops <c>AllowReadingFromString</c>: with those options taken as they are, <c>{"take":"50"}</c> failed
/// although the SDK registration accepted it, and nothing in <c>tools/list</c> showed the change.
/// </remarks>
[TestClass]
public sealed class ToolBindingTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task FleetHttpOptions_ANumberSentAsAString_Binds()
    {
        await using var host = await StartAsync(services => services.AddPleiadesHttpJsonOptions());

        var query = await CallQueryAsync(host, new Dictionary<string, object?> { ["take"] = "50" });

        Assert.AreEqual(50, query["take"]?.GetValue<int>(), query.ToJsonString());
    }

    [TestMethod]
    public async Task FleetHttpOptions_ResultsStillMatchRest()
    {
        // Lenient reading must not change writing: numbers stay numbers and null stays written, as REST does.
        await using var host = await StartAsync(services => services.AddPleiadesHttpJsonOptions());
        var options = new McpConformanceOptions
        {
            RestParity = { new McpRestPair("sample_gauges_get_by_id", new Dictionary<string, object?> { ["id"] = "g1" }, "/gauges/g1") },
        };

        var violations = await McpConformance.CheckRestParityAsync(host.Client, options, TestContext.CancellationToken);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task HttpOptionsWithoutStringEnums_EnumNamesBind_AndTheSchemaListsThem()
    {
        // Web defaults only: no JsonStringEnumConverter, so REST would read and write enums as numbers.
        await using var host = await StartAsync(services => services.ConfigureHttpJsonOptions(_ => { }));
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var query = await CallQueryAsync(host, new Dictionary<string, object?> { ["kind"] = "Temperature" });
        var tools = await connection.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);
        var schema = tools.Single(t => t.Name == "sample_gauges_query").ProtocolTool.InputSchema.GetRawText();

        Assert.AreEqual("Temperature", query["kind"]?.GetValue<string>(), query.ToJsonString());
        Assert.Contains("\"Temperature\"", schema, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task FleetHttpOptions_StayUntouched()
    {
        // The Pleiades options replace the web defaults' AllowReadingFromString; the tools add it to their copy only.
        await using var host = await StartAsync(services => services.AddPleiadesHttpJsonOptions());
        _ = await CallQueryAsync(host, new Dictionary<string, object?> { ["take"] = "3" });

        var http = HttpOptions(host);

        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, http.NumberHandling, "REST must keep its own number handling.");
    }

    [TestMethod]
    public async Task HttpOptionsWithoutStringEnums_StayWithoutThem()
    {
        await using var host = await StartAsync(services => services.ConfigureHttpJsonOptions(_ => { }));
        _ = await CallQueryAsync(host, new Dictionary<string, object?> { ["kind"] = "Temperature" });

        Assert.IsFalse(HttpOptions(host).Converters.Any(c => c is JsonStringEnumConverter), "REST must not start writing enum names.");
    }

    private static JsonSerializerOptions HttpOptions(SampleHost host) =>
        host.App.Services.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;

    private static Task<SampleHost> StartAsync(Action<IServiceCollection> services) =>
        SampleHost.StartAsync(
            mapOpenApi: false,
            tools: mcp => mcp.WithPleiadesTools<GaugeTools>(),
            services: services,
            endpoints: app => app.MapGet("/gauges/{id}", (string id) => TypedResults.Ok(GaugeStore.Get(id))));

    private async Task<JsonObject> CallQueryAsync(SampleHost host, IReadOnlyDictionary<string, object?> arguments)
    {
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);
        var result = await connection.Client.CallToolAsync("sample_gauges_query", arguments, cancellationToken: TestContext.CancellationToken);
        var text = result.Content.OfType<TextContentBlock>().Single().Text;

        Assert.IsFalse(result.IsError is true, text);
        return JsonNode.Parse(text)!.AsObject();
    }
}
