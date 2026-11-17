// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using System.Text.Json.Nodes;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class ProductionEventDtoSerializationTest
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    [TestMethod]
    public void ProductionEvent_WritesItsEnumsAsNames_AndReadsBackTheSame()
    {
        var dto = new ProductionEventDtoV1
        {
            Timestamp = new DateTime(2026, 11, 17, 9, 21, 40, DateTimeKind.Utc),
            Id = "P-04:2026-11-17T06:58:12.000Z:1842",
            MId = "P-04",
            Subject = ProductionSubject.ProgramExecution,
            Action = ProductionAction.Ended,
            CorrelationId = "exec-1",
            JobOrderId = "4711/01",
            ExecutionId = "exec-1",
            WorkMaster = "WELLE_4711.MPF",
            State = "Ended",
            StartTime = new DateTime(2026, 11, 17, 8, 31, 0, DateTimeKind.Utc),
            Duration = 3040,
            PartsProduced = 1,
            EnergyElectricity = 6_661_800,
            Seq = 1842,
        };

        var json = JsonSerializer.Serialize(dto, Json);
        var node = JsonNode.Parse(json)!.AsObject();

        Assert.AreEqual("ProgramExecution", Value(node, "Subject"));
        Assert.AreEqual("Ended", Value(node, "Action"));
        Assert.AreEqual(dto, JsonSerializer.Deserialize<ProductionEventDtoV1>(json, Json));
    }

    [TestMethod]
    public void ProductionEvent_ReadsTheEnumsFromTheirNames()
    {
        const string json = """
            { "Timestamp": "2026-11-17T09:00:00Z", "Id": "x", "MId": "P-04", "Subject": "JobOrder", "Action": "Cancelled",
              "CorrelationId": "4712/01", "JobOrderId": "4712/01", "State": "Aborted", "EndTime": "2026-11-17T09:00:00Z" }
            """;
        var dto = JsonSerializer.Deserialize<ProductionEventDtoV1>(json, Json)!;

        Assert.AreEqual(ProductionSubject.JobOrder, dto.Subject);
        Assert.AreEqual(ProductionAction.Cancelled, dto.Action);
        Assert.IsNull(dto.StartTime);
        Assert.IsNull(dto.Seq, "Seq is optional");
    }

    private static string? Value(JsonObject node, string name)
    {
        // The property naming of the default options decides the case; the enum is a name either way.
        var property = node.FirstOrDefault(p => string.Equals(p.Key, name, StringComparison.OrdinalIgnoreCase));
        return property.Value?.GetValue<string>();
    }
}
