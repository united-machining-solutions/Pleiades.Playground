using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.DataTransferObjects;

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
        "events_notification_query",
        "events_notification_pairs",
        "events_notification_level_distribution",
        "events_notification_time_buckets",
        "events_notification_message_stats"
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
            new Dictionary<string, object?> { ["topic"] = "notification" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsNotNull(result);
        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");

        var content = GetTextContent(result);
        Assert.Contains("Pleiades Events API", content, StringComparison.Ordinal);
        Assert.Contains("events_notification_query", content, StringComparison.Ordinal);
    }

    // ═══════════════════════════════════════════════════════════════
    // TOOL EXECUTION
    // ═══════════════════════════════════════════════════════════════

    [TestMethod]
    public async Task CallTool_NotificationQuery_ReturnsPagedResult()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_query",
            new Dictionary<string, object?>
            {
                ["level"] = "Warning",
                ["take"] = 10
            },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsNotNull(result);
        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");

        var json = GetTextContent(result);
        Assert.IsNotNull(json);

        using var doc = JsonDocument.Parse(json);
        Assert.IsTrue(doc.RootElement.TryGetProperty("items", out _), "Response missing 'items' property");
        Assert.IsTrue(doc.RootElement.TryGetProperty("totalCount", out _), "Response missing 'totalCount' property");
    }

    [TestMethod]
    public async Task CallTool_NotificationLevelDistribution_ReturnsList()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_level_distribution",
            new Dictionary<string, object?>
            {
                ["mId"] = "9000-0000"
            },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsNotNull(result);
        Assert.AreNotEqual(true, result.IsError, $"Tool returned error: {GetTextContent(result)}");

        var json = GetTextContent(result);
        Assert.IsNotNull(json);

        using var doc = JsonDocument.Parse(json);
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
        // With Enum.TryParse(...) ? value : null an invalid level would silently drop the filter and the
        // tool would answer with unfiltered data. REST answers 400 for the same input.
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_query",
            new Dictionary<string, object?> { ["level"] = "Severe" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError, "An invalid level must be refused, not ignored.");
        var text = GetTextContent(result);
        Assert.Contains("Invalid level 'Severe'", text, StringComparison.Ordinal);
        Assert.Contains("Warning", text, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_InvalidSortDirection_IsAToolError()
    {
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_query",
            new Dictionary<string, object?> { ["sortDirection"] = "Newest" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.Contains("Ascending, Descending", GetTextContent(result), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_InvalidBucketSize_KeepsItsFormatHelp()
    {
        // An ArgumentException would not do: the SDK replaces its message with a generic one, so the
        // format help would never reach the caller.
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_time_buckets",
            new Dictionary<string, object?> { ["mId"] = "9000-0000", ["bucketSize"] = "2w" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.Contains("Supported formats", GetTextContent(result), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task CallTool_TakeAboveTheMaximum_EchoesTheTakeActuallyUsed()
    {
        // The query is clamped to 100; echoing the requested 500 would make the skill guide's
        // "totalCount > skip + take" rule wrong.
        await using var scope = await CreateMcpClientAsync(TestContext.CancellationToken);

        var result = await scope.Client.CallToolAsync(
            "events_notification_query",
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
        // Mock NotificationEventRepository
        var notificationMock = new Mock<INotificationEventRepository>();
        notificationMock.Setup(r => r.QueryEventsWithPaginationAsync(
                It.IsAny<string?>(), It.IsAny<Pleiades.Playground.Notification.DataTransferObjects.NotificationAction?>(),
                It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(([], 0L));
        notificationMock.Setup(r => r.QueryPairedEventsWithPaginationAsync(
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(([], 0L));
        notificationMock.Setup(r => r.GetLevelDistributionAsync(
                It.IsAny<string?>(), It.IsAny<DateTime?>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        notificationMock.Setup(r => r.GetTimeBucketsAsync(
                It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        notificationMock.Setup(r => r.GetMessageStatisticsAsync(
                It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        ReplaceService(services, notificationMock.Object);
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
