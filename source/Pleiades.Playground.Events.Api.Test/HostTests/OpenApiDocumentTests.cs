// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace Pleiades.Playground.Events.Api.Test.HostTests;

/// <summary>The contract is the document the service serves at <c>/openapi/v1.json</c>: what it says of jobs.</summary>
[TestClass]
public sealed class OpenApiDocumentTests
{
    private static readonly string[] JobOrderFilters = ["mId", "jobOrderId", "orderNumber", "state", "from", "to"];
    private static readonly string[] JobFields = ["position", "steps", "orderNumbers", "energyElectricity"];
    private static readonly string[] StepFields =
        ["mId", "state", "startTime", "endTime", "durationSeconds", "waitingSecondsBefore", "programExecutions", "partsProduced"];

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task Document_NamesTheJobAcrossMachines_AndTheFiltersOfTheJobOrders()
    {
        await using var factory = ProgramFactory.Create(Environments.Production);
        using var http = factory.CreateClient();

        using var document = JsonDocument.Parse(await http.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), TestContext.CancellationToken));
        var paths = document.RootElement.GetProperty("paths");
        var jobOrderParameters = paths.GetProperty("/jobOrders").GetProperty("get").GetProperty("parameters")
            .EnumerateArray().Select(p => p.GetProperty("name").GetString()).ToList();
        var schemas = document.RootElement.GetProperty("components").GetProperty("schemas");

        Assert.IsTrue(paths.TryGetProperty("/jobs/{jobOrderId}", out var job), "GET /jobs/{jobOrderId}");
        Assert.AreEqual("GetJob", job.GetProperty("get").GetProperty("operationId").GetString());
        CollectionAssert.IsSubsetOf(JobOrderFilters, jobOrderParameters);
        foreach (var field in JobFields)
        {
            Assert.IsTrue(schemas.GetProperty("JobDtoV1").GetProperty("properties").TryGetProperty(field, out _), field);
        }
        foreach (var field in StepFields)
        {
            Assert.IsTrue(schemas.GetProperty("JobStepDtoV1").GetProperty("properties").TryGetProperty(field, out _), field);
        }
    }
}
