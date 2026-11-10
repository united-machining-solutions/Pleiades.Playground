using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Timeseries.Api.Test.McpTests;

/// <summary>
/// The MCP server against the Pleiades conventions (Pleiades.Playground.Mcp.Testing) and against the library's own
/// startup report, on the real Program. Only the discovery surface is exercised, so no MongoDB is needed.
/// </summary>
[TestClass]
public sealed class McpServerConformanceTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task McpServer_FollowsTheFleetConventions_IncludingTheRestLinkBehindTraefik()
    {
        // The full check of Pleiades.Playground.Mcp.Testing: the conventions, plus a second connect with
        // X-Forwarded-Proto/-Host/-Prefix as Traefik sends them. The REST link must carry exactly that
        // scheme, host and path prefix and must resolve. OpenAPI is served in every
        // environment, so a missing link is a failure here and in Production.
        await using var factory = ProgramFactory.Create(Environments.Development);
        using var http = factory.CreateClient();

        var violations = await McpConformance.CheckAsync(
            http, "timeseries", new McpConformanceOptions { RequireRestApi = true }, TestContext.CancellationToken);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task McpServer_InProduction_FollowsTheFleetConventions_IncludingTheRestLink()
    {
        // Production is where an agent meets the server, and no deployment sets ASPNETCORE_ENVIRONMENT. It
        // serves OpenAPI like every other environment, so the link is required here too: with an
        // environment switch around MapOpenApi, this test fails.
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();

        var violations = await McpConformance.CheckAsync(
            http, "timeseries", new McpConformanceOptions { RequireRestApi = true }, TestContext.CancellationToken);

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    [TestMethod]
    public async Task Instructions_LinkTheOpenApiDocument()
    {
        await using var factory = ProgramFactory.Create(Environments.Development);
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);

        var instructions = connection.Client.ServerInstructions;

        Assert.IsNotNull(instructions);
        Assert.Contains("http://localhost/openapi/v1.json", instructions, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Instructions_StayWithinTheBudgetClientsKeep()
    {
        // Clients keep the first 2048 characters of the instructions. The library only warns at
        // startup above that; this reads what a client actually receives.
        await using var factory = ProgramFactory.Create(Environments.Development);
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);

        var instructions = connection.Client.ServerInstructions;

        Assert.IsNotNull(instructions);
        Assert.IsLessThanOrEqualTo(2048, instructions.Length, $"The instructions are {instructions.Length} characters long.");
    }

    [TestMethod]
    public async Task DescribeServer_ListsEveryTimeseriesTool()
    {
        await using var factory = ProgramFactory.Create(Environments.Development);
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);

        var result = await connection.Client.CallToolAsync("timeseries_describe_server", cancellationToken: TestContext.CancellationToken);
        var text = result.Content.OfType<TextContentBlock>().Single().Text;

        foreach (var tool in new[] { "timeseries_topics_query", "timeseries_baseunit_query", "timeseries_string_query", "timeseries_boolean_query", "timeseries_statistics_query" })
        {
            Assert.Contains("- " + tool + "\n", text, StringComparison.Ordinal);
        }
    }

    [TestMethod]
    [DataRow("Development")]
    [DataRow("Production")]
    public async Task StartupCheck_ReportsNoDeviation(string environment)
    {
        // The library checks the server at startup but only logs what it finds: a write tool without a write
        // guard, a bare [Authorize], a tool registered past the HTTP JSON options or twice, GET /skill mapped
        // twice, instructions over budget. Its report carries the same texts, and this test makes them a gate.
        await using var factory = ProgramFactory.Create(environment);
        using var http = factory.CreateClient(); // starts the host, which runs the check

        var deviations = factory.Services.GetRequiredService<McpServerConventionReport>().Deviations;

        Assert.IsEmpty(deviations, string.Join(Environment.NewLine, deviations));
    }
}
