using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Testing;
using DescriptionAttribute = System.ComponentModel.DescriptionAttribute;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// Review findings, each pinned where it was reproduced: the describe text per caller, the service's
/// own session hook and a host that forms no URI.
/// </summary>
[TestClass]
public sealed class ReviewFixesTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    [DataRow("reader", false, DisplayName = "a reader does not see the write tool")]
    [DataRow(null, false, DisplayName = "an anonymous caller does not see it")]
    [DataRow("writer", true, DisplayName = "a writer sees it")]
    public async Task DescribeServer_ListsOnlyTheToolsTheCallerMaySee(string? roles, bool seesWriteTool)
    {
        await using var host = await StartWithAuthAsync();
        var headers = roles is null ? null : new Dictionary<string, string> { [HeaderRolesAuthenticationHandler.Header] = roles };
        await using var connection = await McpTestClient.ConnectAsync(host.Client, headers: headers, cancellationToken: TestContext.CancellationToken);

        var listed = (await connection.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken)).Select(t => t.Name).ToList();
        var describe = await DescribeAsync(connection);

        Assert.AreEqual(seesWriteTool, listed.Contains("sample_items_purge"), "tools/list, filtered by the SDK");
        Assert.AreEqual(seesWriteTool, describe.Contains("- sample_items_purge\n", StringComparison.Ordinal), describe);
        Assert.Contains("- sample_items_query\n", describe, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Conformance_ForAReader_FindsNoToolThatDescribeLeaks()
    {
        await using var host = await StartWithAuthAsync();
        var reader = new Dictionary<string, string> { [HeaderRolesAuthenticationHandler.Header] = "reader" };
        await using var connection = await McpTestClient.ConnectAsync(host.Client, headers: reader, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, SampleHost.Prefix, TestContext.CancellationToken);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Conformance_DescribeNamesAToolThatToolsListHides_IsReported()
    {
        await using var host = await BareHost.StartAsync(
            "Call bare_get_skill_guide first.",
            ReadTool("bare_describe_server", () => "A bare server.\nAvailable tools:\n- bare_hidden_tool\n"),
            ReadTool("bare_get_skill_guide", () => "# Guide"));
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var violations = await McpConformance.CheckAsync(connection.Client, BareHost.Prefix, TestContext.CancellationToken);

        Assert.Contains("'bare_describe_server' lists the tool 'bare_hidden_tool', which tools/list does not offer this caller.", violations);
    }

    [TestMethod]
    [DataRow(true, DisplayName = "service hook registered before the library")]
    [DataRow(false, DisplayName = "service hook registered after the library")]
    public async Task ServicesOwnSessionHook_RunsNextToTheInstructions(bool registeredBefore)
    {
        static Task Hook(HttpContext context, McpServerOptions options, CancellationToken cancellationToken)
        {
            options.ServerInstructions += "Service hook ran.\n";
            return Task.CompletedTask;
        }

        await using var host = await SampleHost.StartAsync(
            mapOpenApi: true,
            services: registeredBefore ? s => s.Configure<HttpServerTransportOptions>(t => t.ConfigureSessionOptions = Hook) : null,
            tools: registeredBefore ? null : mcp => mcp.WithHttpTransport(t => t.ConfigureSessionOptions = Hook));
        await using var connection = await McpTestClient.ConnectAsync(host.Client, cancellationToken: TestContext.CancellationToken);

        var instructions = connection.Client.ServerInstructions ?? string.Empty;

        Assert.Contains("REST API: described at http://localhost/openapi/v1.json", instructions, StringComparison.Ordinal);
        Assert.Contains("Service hook ran.", instructions, StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow("", DisplayName = "empty Host")]
    [DataRow("a!b", DisplayName = "forwarded host that forms no URI")]
    [DataRow("a!..b", DisplayName = "host that is no valid IDN name")]
    public void Instructions_HostThatFormsNoUri_DropTheRestLineInsteadOfThrowing(string host)
    {
        var instructions = RenderFor(host);

        Assert.DoesNotContain("REST API:", instructions, StringComparison.Ordinal);
        Assert.Contains("sample_get_skill_guide", instructions, StringComparison.Ordinal);
    }

    [TestMethod]
    public void Instructions_ValidHost_CarryTheLink()
    {
        Assert.Contains("REST API: described at https://example.test/openapi/v1.json", RenderFor("example.test"), StringComparison.Ordinal);
    }

    private static string RenderFor(string host)
    {
        var services = new ServiceCollection()
            .AddSingleton<EndpointDataSource>(new DefaultEndpointDataSource(new RouteEndpoint(
                _ => Task.CompletedTask, RoutePatternFactory.Parse("/openapi/{documentName}.json"), 0, EndpointMetadataCollection.Empty, "openapi")))
            .BuildServiceProvider();
        var surface = new DiscoverySurface(
            new PleiadesMcpServerOptions { Prefix = SampleHost.Prefix, Title = "Sample.", ServerAssembly = typeof(SampleHost).Assembly },
            typeof(SampleHost).Assembly);
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Scheme = "https";
        // As the header arrives: the Host setter would IDN-map the value itself.
        context.Request.Headers.Host = host;

        return surface.RenderInstructions(context);
    }

    private static Task<SampleHost> StartWithAuthAsync() =>
        SampleHost.StartAsync(
            mapOpenApi: false,
            tools: mcp => mcp.WithPleiadesTools<ProtectedTools>(),
            services: services =>
            {
                services.AddAuthentication(HeaderRolesAuthenticationHandler.SchemeName)
                    .AddScheme<AuthenticationSchemeOptions, HeaderRolesAuthenticationHandler>(HeaderRolesAuthenticationHandler.SchemeName, null);
                services.AddAuthorization();
            },
            endpoints: app =>
            {
                app.UseAuthentication();
                app.UseAuthorization();
            });

    private async Task<string> DescribeAsync(McpTestConnection connection)
    {
        var result = await connection.Client.CallToolAsync("sample_describe_server", cancellationToken: TestContext.CancellationToken);
        return result.Content.OfType<TextContentBlock>().Single().Text;
    }

    private static McpServerTool ReadTool(string name, Delegate method) =>
        McpServerTool.Create(method, new McpServerToolCreateOptions { Name = name, Description = $"Test tool {name}.", ReadOnly = true });

    [McpServerToolType]
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Only a type argument for the tool registration; its tools are static.")]
    internal sealed class ProtectedTools
    {
        [McpServerTool(Name = "sample_items_purge", ReadOnly = false, Destructive = true), Description("Delete every item.")]
        [Authorize(Roles = "writer")]
        public static string Purge() => "purged";
    }
}
