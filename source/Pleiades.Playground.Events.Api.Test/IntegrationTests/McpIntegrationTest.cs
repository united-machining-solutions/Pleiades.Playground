using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;
using Pleiades.Playground.Common.Pagination;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

[TestClass]
public class McpIntegrationTest : IntegrationTestBase
{
    public required TestContext TestContext { get; set; }

    private sealed class McpClientScope(
        McpClient client,
        HttpClient? httpClient = null,
        WebApplicationFactory<Program>? factory = null) : IAsyncDisposable
    {
        public McpClient Client { get; } = client;

        public async ValueTask DisposeAsync()
        {
            await this.Client.DisposeAsync();
            httpClient?.Dispose();

            if (factory is not null)
            {
                await factory.DisposeAsync();
            }
        }
    }

    private static readonly string[] ExpectedToolNames =
    [
        "events_describe_server",
        "events_get_skill_guide",
        "events_machine_events_query",
        "events_sequence_gaps_query",
        "events_active_alerts_query",
        "events_alert_pairs_query",
        "events_alert_statistics_query",
        "events_job_orders_query",
        "events_program_executions_query"
    ];

    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope", Justification = "The created disposables are transferred to McpClient and McpClientScope for the test lifetime.")]
    private static async Task<McpClientScope> CreateMcpClientAsync(CancellationToken ct)
    {
        if (Containerized)
        {
            var transport = new HttpClientTransport(new HttpClientTransportOptions
            {
                Endpoint = new Uri(BaseUrl, "/mcp")
            });

            var client = await McpClient.CreateAsync(transport, cancellationToken: ct);

            return new McpClientScope(client);
        }

        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                MockRepositories(services);
            }).UseEnvironment("Test");
        });

        var httpClient = factory.CreateClient();

        var scopedTransport = new HttpClientTransport(
            new HttpClientTransportOptions { Endpoint = new Uri(httpClient.BaseAddress!, "/mcp") },
            httpClient,
            ownsHttpClient: false);

        var scopedClient = await McpClient.CreateAsync(scopedTransport, cancellationToken: ct);

        return new McpClientScope(scopedClient, httpClient, factory);
    }

    // ═══════════════════════════════════════════════════════════════
    // TOOL DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    public async Task ListTools_ReturnsEveryRegisteredTool()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var tools = await scope.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);
        var toolNames = tools.Select(t => t.Name).OrderBy(n => n).ToArray();

        CollectionAssert.AreEquivalent(
            ExpectedToolNames,
            toolNames,
            $"Expected {ExpectedToolNames.Length} tools, got {toolNames.Length}. Found: {string.Join(", ", toolNames)}");
    }

    [TestMethod]
    public async Task ListTools_AllToolsHaveDescriptions()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var tools = await scope.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);

        foreach (var tool in tools)
        {
            Assert.IsFalse(string.IsNullOrWhiteSpace(tool.Description),
                $"Tool '{tool.Name}' has no description");
            Assert.IsFalse(string.IsNullOrWhiteSpace(tool.JsonSchema.ToString()),
                $"Tool '{tool.Name}' has no input schema");
        }
    }

    [TestMethod]
    public async Task CallTool_DescribeServer_ReturnsDiscoveryGuidance()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_describe_server",
            cancellationToken: TestContext.CancellationToken);

        Assert.IsNotNull(result);
        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");

        var content = GetTextContent(result);
        Assert.Contains("events_get_skill_guide", content, StringComparison.Ordinal);
        // By URI: Pleiades.Playground.Mcp.Server registers the guide and owns its name.
        Assert.Contains("events://skill", content, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_GetSkillGuide_ReturnsMarkdown()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_get_skill_guide",
            new Dictionary<string, object?> { ["topic"] = "alerts" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsNotNull(result);
        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");

        var content = GetTextContent(result);
        Assert.Contains("Pleiades Events API", content, StringComparison.Ordinal);
        Assert.Contains("events_active_alerts_query", content, StringComparison.Ordinal);
    }

    // ═══════════════════════════════════════════════════════════════
    // TOOL EXECUTION
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    [DataRow("events_machine_events_query")]
    [DataRow("events_active_alerts_query")]
    [DataRow("events_alert_pairs_query")]
    [DataRow("events_job_orders_query")]
    [DataRow("events_program_executions_query")]
    public async Task CallTool_PagedViews_ReturnPagedResults(string tool)
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            tool,
            new Dictionary<string, object?> { ["mId"] = MachineEventSamples.MachineId, ["take"] = 10 },
            cancellationToken: TestContext.CancellationToken);

        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");
        using var doc = JsonDocument.Parse(GetTextContent(result) ?? string.Empty);
        Assert.IsTrue(doc.RootElement.TryGetProperty("items", out var items), "Response missing 'items' property");
        Assert.IsTrue(doc.RootElement.TryGetProperty("totalCount", out _), "Response missing 'totalCount' property");
        if (!Containerized)
        {
            Assert.IsGreaterThan(0, items.GetArrayLength(), $"{tool} answers from the events");
        }
    }

    [TestMethod]
    [DataRow("events_alert_statistics_query")]
    [DataRow("events_sequence_gaps_query")]
    public async Task CallTool_Lists_ReturnArrays(string tool)
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            tool,
            new Dictionary<string, object?> { ["mId"] = MachineEventSamples.MachineId },
            cancellationToken: TestContext.CancellationToken);

        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");
        using var doc = JsonDocument.Parse(GetTextContent(result));
        Assert.AreEqual(JsonValueKind.Array, doc.RootElement.ValueKind, "Expected array response");
    }

    // ═══════════════════════════════════════════════════════════════
    // RESOURCE DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    public async Task ListResources_ContainsSkillGuide()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        // By URI: Pleiades.Playground.Mcp.Server registers the guide and owns its name.
        var resources = await scope.Client.ListResourcesAsync(cancellationToken: TestContext.CancellationToken);
        var skillResource = resources.FirstOrDefault(r => r.Uri == "events://skill");

        if (skillResource == null)
        {
            var templates = await scope.Client.ListResourceTemplatesAsync(cancellationToken: TestContext.CancellationToken);
            var skillTemplate = templates.FirstOrDefault(r => r.UriTemplate == "events://skill");
            Assert.IsNotNull(skillTemplate, "Skill guide not found in resources or resource templates");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SKILL ENDPOINT
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    public async Task SkillEndpoint_ReturnsMarkdown()
    {
        if (Containerized)
        {
            using var httpClient = new HttpClient();
            var response = await httpClient.GetAsync(new Uri(BaseUrl, "/skill"), TestContext.CancellationToken);
            Assert.AreEqual(System.Net.HttpStatusCode.OK, response.StatusCode);

            var contentType = response.Content.Headers.ContentType?.MediaType;
            Assert.AreEqual("text/markdown", contentType);

            var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);
            Assert.Contains("Pleiades Events API", content, StringComparison.Ordinal);
        }
        else
        {
            await using var baseFactory = new WebApplicationFactory<Program>();
            await using var factory = baseFactory.WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services => MockRepositories(services))
                    .UseEnvironment("Test");
            });
            using var httpClient = factory.CreateClient();

            var response = await httpClient.GetAsync(new Uri(httpClient.BaseAddress!, "/skill"), TestContext.CancellationToken);
            Assert.AreEqual(System.Net.HttpStatusCode.OK, response.StatusCode);

            var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);
            Assert.Contains("Pleiades Events API", content, StringComparison.Ordinal);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ARGUMENTS LIKE REST
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    public async Task CallTool_InvalidFilterValue_IsAToolErrorNamingTheAllowedValues()
    {
        // An invalid severity that silently dropped the filter would answer with unfiltered data.
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_alert_pairs_query",
            new Dictionary<string, object?> { ["severity"] = "Severe" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError, "An invalid severity must be refused, not ignored.");
        var text = GetTextContent(result);
        Assert.Contains("Invalid severity 'Severe'", text, StringComparison.Ordinal);
        Assert.Contains("MaintenanceRequired", text, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_InvalidSortDirection_IsAToolError()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_machine_events_query",
            new Dictionary<string, object?> { ["sortDirection"] = "Newest" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.Contains("Ascending, Descending", GetTextContent(result), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_InvalidGroup_NamesTheGroups()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_sequence_gaps_query",
            new Dictionary<string, object?> { ["group"] = "Production" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.Contains("JobMonitoring, WorkMasterMonitoring, Notification", GetTextContent(result), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_TakeAboveTheMaximum_EchoesTheTakeActuallyUsed()
    {
        // The query is clamped to 100; echoing the requested 500 would make the skill guide's
        // "totalCount > skip + take" rule wrong.
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_machine_events_query",
            new Dictionary<string, object?> { ["take"] = 500 },
            cancellationToken: TestContext.CancellationToken);

        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");
        using var doc = JsonDocument.Parse(GetTextContent(result));
        var take = doc.RootElement.EnumerateObject().Single(p => string.Equals(p.Name, "take", StringComparison.OrdinalIgnoreCase));
        Assert.AreEqual(100, take.Value.GetInt32());
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    private static string GetTextContent(ModelContextProtocol.Protocol.CallToolResult result)
    {
        var textContent = result.Content.FirstOrDefault(c => c is ModelContextProtocol.Protocol.TextContentBlock) as ModelContextProtocol.Protocol.TextContentBlock;
        return textContent?.Text ?? string.Empty;
    }

    private static void MockRepositories(IServiceCollection services)
    {
        // The repository of the CloudEvents: one shift of one machine.
        var stored = MachineEventSamples.StoredShift();
        var repository = new Mock<IMachineEventRepository>();
        repository.Setup(r => r.QueryAsync(
                It.IsAny<MachineEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((stored, stored.Count));
        repository.Setup(r => r.FindForViewAsync(It.IsAny<MachineEventFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MachineEventFilter f, CancellationToken _) => [.. stored.Where(e => f.Group is null || e.Group == f.Group)]);
        ReplaceService(services, repository.Object);
    }

    private static void ReplaceService<T>(IServiceCollection services, T implementation) where T : class
    {
        var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(T));
        if (descriptor != null)
        {
            services.Remove(descriptor);
        }

        services.AddSingleton(implementation);
    }
}
