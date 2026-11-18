using System.Text.Json.Nodes;
using Microsoft.Extensions.Hosting;

namespace Pleiades.Playground.Events.Api.Test.HostTests;

/// <summary>
/// The document <c>/openapi/read.json</c> and its Swagger UI at <c>/docs/</c>: the reading endpoints, as the
/// gateway passes them (ADR-0017). The gateway's allowlist is checked against this document in CI.
/// </summary>
[TestClass]
public sealed class ReadOnlyOpenApiTests
{
    private static readonly string[] ReadingOperations =
    [
        "get /machineEvents", "get /machineEvents/gaps",
        "get /alerts/active", "get /alerts/pairs", "get /alerts/statistics",
        "get /jobOrders", "get /jobOrders/{mId}/{jobOrderId}",
        "get /programExecutions",
    ];

    private static readonly string[] WritingOperations = ["post /machineEvents", "post /machineEvents/bulk"];

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task TheReadDocument_HoldsTheReadingOperationsOnly()
    {
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();

        var document = JsonNode.Parse(await http.GetStringAsync(new Uri("/openapi/read.json", UriKind.Relative), TestContext.CancellationToken))!;

        CollectionAssert.AreEquivalent(ReadingOperations, Operations(document));
    }

    [TestMethod]
    public async Task TheFullDocument_StillHoldsTheWritingOperations()
    {
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();

        var document = JsonNode.Parse(await http.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), TestContext.CancellationToken))!;

        CollectionAssert.IsSubsetOf(WritingOperations, Operations(document));
    }

    [TestMethod]
    public async Task BehindTheGateway_TheServerIsTheGatewayWithItsPrefix()
    {
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/openapi/read.json");
        request.Headers.Add("X-Forwarded-Proto", "http");
        request.Headers.Add("X-Forwarded-Host", "pleiades.example:5590");
        request.Headers.Add("X-Forwarded-Prefix", "/events");

        using var response = await http.SendAsync(request, TestContext.CancellationToken);
        var document = JsonNode.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken))!;

        Assert.AreEqual("http://pleiades.example:5590/events", document["servers"]![0]!["url"]!.GetValue<string>().TrimEnd('/'));
    }

    [TestMethod]
    public async Task TheSwaggerUi_ShowsTheReadDocument()
    {
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();

        var page = await http.GetStringAsync(new Uri("/docs/index.html", UriKind.Relative), TestContext.CancellationToken);
        var script = await http.GetStringAsync(new Uri("/docs/index.js", UriKind.Relative), TestContext.CancellationToken);

        Assert.Contains("swagger-ui", page, StringComparison.Ordinal);
        Assert.Contains("../openapi/read.json", script, StringComparison.Ordinal);
    }

    private static List<string> Operations(JsonNode document) =>
        document["paths"]!.AsObject()
            .SelectMany(path => path.Value!.AsObject().Select(operation => $"{operation.Key} {path.Key}"))
            .ToList();
}
