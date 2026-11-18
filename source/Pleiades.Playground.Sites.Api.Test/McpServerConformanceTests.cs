using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mcp.Testing;
using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// The MCP server against the shared conventions (Pleiades.Playground.Mcp.Testing), on the real Program with the
/// store in memory: tool names, discovery, the REST link, and the same JSON from a tool as from its REST request.
/// </summary>
[TestClass]
public sealed class McpServerConformanceTests
{
    private static readonly string[] ExpectedTools =
    [
        "sites_describe_server",
        "sites_get_skill_guide",
        "sites_placement_list",
        "sites_site_list",
    ];

    public required TestContext TestContext { get; set; }

    private CancellationToken Ct => TestContext.CancellationToken;

    [TestMethod]
    [DataRow("Development")]
    [DataRow("Production")]
    public async Task McpServer_FollowsTheFleetConventions_AndAnswersLikeRest(string environment)
    {
        using var store = await SeededStoreAsync();
        await using var factory = SitesApiFactory.Create(store, new FixedTimeProvider(ApiTestBase.Start), environment);
        using var http = factory.CreateClient();
        var options = new McpConformanceOptions { RequireRestApi = true };
        options.RestParity.Add(new McpRestPair("sites_site_list", new Dictionary<string, object?>(), "/sites"));
        options.RestParity.Add(new McpRestPair("sites_placement_list", new Dictionary<string, object?>(), "/placements"));

        var violations = await McpConformance.CheckAsync(http, "sites", options, Ct);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task ToolsList_OffersOnlyReadingTools()
    {
        using var store = new InMemorySitesStore();
        await using var factory = SitesApiFactory.Create(store, new FixedTimeProvider(ApiTestBase.Start), Environments.Development);
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: Ct);

        var tools = await connection.Client.ListToolsAsync(cancellationToken: Ct);

        CollectionAssert.AreEquivalent(ExpectedTools, tools.Select(t => t.Name).ToArray());
        Assert.IsTrue(
            tools.All(t => t.ProtocolTool.Annotations?.ReadOnlyHint is true),
            "a tool of the Sites API is not read-only: " + string.Join(", ", tools.Where(t => t.ProtocolTool.Annotations?.ReadOnlyHint is not true).Select(t => t.Name)));
    }

    [TestMethod]
    [DataRow("Development")]
    [DataRow("Production")]
    public async Task StartupCheck_ReportsNoDeviation(string environment)
    {
        using var store = new InMemorySitesStore();
        await using var factory = SitesApiFactory.Create(store, new FixedTimeProvider(ApiTestBase.Start), environment);
        using var http = factory.CreateClient(); // starts the host, which runs the check

        var deviations = factory.Services.GetRequiredService<McpServerConventionReport>().Deviations;

        Assert.IsEmpty(deviations, string.Join(Environment.NewLine, deviations));
    }

    private async Task<InMemorySitesStore> SeededStoreAsync()
    {
        var store = new InMemorySitesStore();
        await store.SaveSiteAsync(new SiteDao { SiteId = "north-plant", Company = "Demo Manufacturing", Name = "North plant", Halls = ["Hall 1", "Hall 2"] }, Ct);
        await store.SavePlacementAsync(new PlacementDao { MachineId = "M-05", SiteId = "north-plant", Hall = "Hall 2", DisplayName = "M-05", PlacedAt = ApiTestBase.Start.UtcDateTime }, Ct);
        await store.SavePlacementAsync(new PlacementDao { MachineId = "P-04", SiteId = "north-plant", PlacedAt = ApiTestBase.Start.UtcDateTime }, Ct);
        return store;
    }
}
