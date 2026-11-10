using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// <see cref="McpConformance"/> against servers that break the conventions on purpose. A conformance check
/// that has only ever seen conforming servers proves nothing: it would pass them all the same if it checked nothing.
/// </summary>
[TestClass]
public sealed class McpConformanceViolationTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Conformance_BareServer_ReportsEveryMissingConvention()
    {
        // One tool that breaks every per-tool rule: name, description, ReadOnly and a plumbing parameter in the schema.
        var badTool = McpServerTool.Create((string context) => context, new McpServerToolCreateOptions { Name = "BadTool" });
        await using var host = await BareHost.StartAsync(instructions: null, badTool);
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, BareHost.Prefix, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(
            [
                "The server sends no instructions.",
                "Tool 'BadTool' is not named 'bare_{domain}_{operation}' in snake_case.",
                "Tool 'BadTool' has no description.",
                "Tool 'BadTool' does not declare ReadOnly.",
                "Tool 'BadTool' exposes the plumbing parameter 'context' in its input schema.",
                "Discovery tool 'bare_describe_server' is missing.",
                "Discovery tool 'bare_get_skill_guide' is missing.",
                "Resource 'bare://skill' is missing.",
            ],
            violations,
            StringComparer.Ordinal,
            string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Conformance_DiscoveryToolsBroken_ReportsTheGapAndTheError()
    {
        // The discovery tools exist but do not do their job: describe omits a tool, the guide fails.
        await using var host = await BareHost.StartAsync(
            "A bare server without a pointer to its guide.",
            ReadTool("bare_describe_server", () => "Available tools: none."),
            ReadTool("bare_get_skill_guide", string () => throw new McpException("The guide is not embedded.")),
            ReadTool("bare_items_query", () => "[]"));
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, BareHost.Prefix, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(
            [
                "The instructions do not point to 'bare_get_skill_guide'.",
                "'bare_describe_server' does not list the registered tool 'bare_items_query'.",
                "'bare_get_skill_guide' returned an error: An error occurred invoking 'bare_get_skill_guide': The guide is not embedded.",
                "Resource 'bare://skill' is missing.",
            ],
            violations,
            StringComparer.Ordinal,
            string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Conformance_DescribeReturnsNoText_ReportsIt()
    {
        await using var host = await BareHost.StartAsync(
            "Call bare_get_skill_guide first.",
            ReadTool("bare_describe_server", () => " "),
            ReadTool("bare_get_skill_guide", () => "# Guide"));
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, BareHost.Prefix, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(
            ["'bare_describe_server' returned no text.", "Resource 'bare://skill' is missing."],
            violations,
            StringComparer.Ordinal,
            string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task RestLink_DoesNotResolve_ReportsTheStatus()
    {
        // The link carries the forwarded scheme, host and prefix, but nothing answers behind it.
        var link = $"{McpConformance.ProxyScheme}://{McpConformance.ProxyHost}{McpConformance.ProxyPathPrefix}/openapi/v1.json";
        await using var host = await BareHost.StartAsync($"REST API: described at {link}; it accepts the same credentials.");

        var violations = await McpConformance.CheckRestLinkBehindProxyAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        Assert.HasCount(1, violations);
        Assert.AreEqual($"The REST link {link} does not resolve: GET /openapi/v1.json on the service answered 404.", violations[0]);
    }

    [TestMethod]
    public async Task Connect_PathWithoutMcpEndpoint_Throws()
    {
        await using var host = await BareHost.StartAsync(instructions: null);

        await Assert.ThrowsAsync<HttpRequestException>(
            () => McpTestClient.ConnectAsync(host.Client, "/not-mcp", cancellationToken: TestContext.CancellationToken));
    }

    private static McpServerTool ReadTool(string name, Delegate method) =>
        McpServerTool.Create(method, new McpServerToolCreateOptions { Name = name, Description = $"Test tool {name}.", ReadOnly = true });
}
