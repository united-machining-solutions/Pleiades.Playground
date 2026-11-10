using System.Reflection;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Mcp.Server.Test;

[TestClass]
public sealed class McpServerStandardTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Conformance_StandardServer_HasNoViolations()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, SampleHost.Prefix, TestContext.CancellationToken);

        Assert.AreEqual(0, violations.Count, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Conformance_BehindReverseProxy_RestLinkCarriesForwardedSchemeHostAndPrefix()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true);

        var violations = await McpConformance.CheckAsync(
            host.Client, SampleHost.Prefix, new McpConformanceOptions { RequireRestApi = true }, TestContext.CancellationToken);

        Assert.AreEqual(0, violations.Count, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Conformance_ForwardedHeadersNotApplied_ReportsTheWrongRestLink()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true, useForwardedHeaders: false);

        var violations = await McpConformance.CheckRestLinkBehindProxyAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        Assert.HasCount(1, violations);
        StringAssert.Contains(violations[0], "http://localhost/openapi/v1.json", StringComparison.Ordinal);
        StringAssert.Contains(violations[0], "UsePleiadesForwardedHeaders", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Conformance_RestApiRequiredButNotServed_ReportsTheMissingLink()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: false);

        var violations = await McpConformance.CheckRestLinkBehindProxyAsync(
            host.Client, new McpConformanceOptions { RequireRestApi = true }, TestContext.CancellationToken);

        Assert.HasCount(1, violations);
        StringAssert.Contains(violations[0], "no REST link", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Conformance_RestApiNotServedAndNotRequired_HasNoViolations()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: false);

        var violations = await McpConformance.CheckAsync(host.Client, SampleHost.Prefix, cancellationToken: TestContext.CancellationToken);

        Assert.AreEqual(0, violations.Count, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Instructions_BehindReverseProxy_LinkCarriesSchemeHostAndPrefix()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true);
        var forwarded = new Dictionary<string, string>
        {
            ["X-Forwarded-Proto"] = "https",
            ["X-Forwarded-Host"] = "gateway.example.com",
            ["X-Forwarded-Prefix"] = "/sample",
        };
        await using var connection = await McpTestClient.ConnectAsync(host.Client, headers: forwarded, cancellationToken: TestContext.CancellationToken);

        StringAssert.Contains(
            connection.Client.ServerInstructions,
            "https://gateway.example.com/sample/openapi/v1.json",
            StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Instructions_OpenApiServed_LinkTheDocumentAsTheClientReachedIt()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var instructions = connection.Client.ServerInstructions;

        Assert.IsNotNull(instructions);
        StringAssert.Contains(instructions, "http://localhost/openapi/v1.json", StringComparison.Ordinal);
        StringAssert.Contains(instructions, "same credentials as this MCP endpoint", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Instructions_OpenApiNotServed_AdvertiseNoRestApi()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: false);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var instructions = connection.Client.ServerInstructions;

        Assert.IsNotNull(instructions);
        Assert.IsFalse(instructions.Contains("REST API", StringComparison.Ordinal), instructions);
        StringAssert.Contains(instructions, "sample_get_skill_guide", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Instructions_OpenApiDisabled_AdvertiseNoRestApiEvenWhenServed()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true, options => options.OpenApiDocumentPath = null);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        Assert.IsFalse(connection.Client.ServerInstructions?.Contains("REST API", StringComparison.Ordinal) ?? false);
    }

    [TestMethod]
    public async Task DescribeServer_ListsTheRegisteredToolsAndRepeatsTheInstructions()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: true);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var result = await connection.Client.CallToolAsync("sample_describe_server", cancellationToken: TestContext.CancellationToken);
        var text = result.Content.OfType<TextContentBlock>().Single().Text;

        StringAssert.Contains(text, "Available tools:\n- sample_items_query\n", StringComparison.Ordinal);
        StringAssert.Contains(text, "http://localhost/openapi/v1.json", StringComparison.Ordinal);
        Assert.IsFalse(text.Contains("- sample_describe_server", StringComparison.Ordinal), "The discovery tools are not part of the tool list.");
    }

    [TestMethod]
    public async Task ServerInfo_VersionIsTheStampedAssemblyVersion()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: false);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var informational = typeof(SampleHost).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;
        var expected = informational.Split('+')[0];

        Assert.AreEqual(expected, connection.Client.ServerInfo.Version);
        Assert.AreEqual("Pleiades.Playground.Mcp.Server.Test", connection.Client.ServerInfo.Name);
    }

    [TestMethod]
    public async Task SkillEndpoint_ServesTheGuideAsMarkdown()
    {
        await using var host = await SampleHost.StartAsync(mapOpenApi: false);

        using var response = await host.Client.GetAsync(new Uri("/skill", UriKind.Relative), TestContext.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);

        Assert.IsTrue(response.IsSuccessStatusCode);
        Assert.AreEqual("text/markdown", response.Content.Headers.ContentType?.MediaType);
        StringAssert.StartsWith(body, "# Sample skill guide", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task SkillGuideMissing_FailsAtRegistration()
    {
        var error = await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => SampleHost.StartAsync(mapOpenApi: false, options => options.SkillGuideResourceName = "Missing.skill.md"));

        StringAssert.Contains(error.Message, "Missing.skill.md", StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("Uptime")]
    [DataRow("time_series")]
    [DataRow("1st")]
    public async Task InvalidPrefix_FailsAtRegistration(string prefix)
    {
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => SampleHost.StartAsync(mapOpenApi: false, options => options.Prefix = prefix));
    }
}
