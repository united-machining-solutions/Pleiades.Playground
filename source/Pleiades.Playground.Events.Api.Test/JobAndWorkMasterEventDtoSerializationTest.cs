// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using System.Text.Json.Nodes;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class JobAndWorkMasterEventDtoSerializationTest
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    [TestMethod]
    public void JobEvent_WritesItsActionAsAName_AndReadsBackTheSame()
    {
        var dto = new JobEventDtoV1
        {
            Timestamp = new DateTime(2026, 11, 17, 9, 21, 40, DateTimeKind.Utc),
            Id = "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60",
            MId = "P-04",
            Action = JobAction.ResultChanged,
            CorrelationId = "4711/01",
            JobOrderId = "4711/01",
            State = "Running",
            JobName = "Shaft 4711",
            WorkMasterId = "WM-SHAFT-4711",
            OrderNumbers = ["SO-4711"],
            RunsPlanned = 12,
            JobExecutionMode = "ProductionMode",
            StartTime = new DateTime(2026, 11, 17, 8, 31, 0, DateTimeKind.Utc),
            ProducedQuantity = 3,
            GoodQuantity = 3,
            RunsCompleted = 3,
            ActualProductionTime = 180,
            JobResult = "Unknown",
            Seq = 42,
        };

        var json = JsonSerializer.Serialize(dto, Json);
        var node = JsonNode.Parse(json)!.AsObject();
        var back = JsonSerializer.Deserialize<JobEventDtoV1>(json, Json)!;

        Assert.AreEqual("ResultChanged", Value(node, "Action"));
        Assert.AreEqual(dto with { OrderNumbers = null }, back with { OrderNumbers = null });
        CollectionAssert.AreEqual(dto.OrderNumbers.ToList(), back.OrderNumbers!.ToList());
    }

    [TestMethod]
    public void JobEvent_BeforeTheStart_HasNoResult()
    {
        const string json = """
            { "Timestamp": "2026-11-17T09:00:00Z", "Id": "x", "MId": "P-04", "Action": "Cancelled",
              "CorrelationId": "4712/01", "JobOrderId": "4712/01", "State": "Aborted", "PlannedStartTime": null }
            """;
        var dto = JsonSerializer.Deserialize<JobEventDtoV1>(json, Json)!;

        Assert.AreEqual(JobAction.Cancelled, dto.Action);
        Assert.IsNull(dto.StartTime);
        Assert.IsNull(dto.ProducedQuantity);
        Assert.IsNull(dto.PlannedStartTime);
        Assert.IsNull(dto.Seq, "Seq is optional");
    }

    [TestMethod]
    public void WorkMasterEvent_WritesItsActionAsAName_AndReadsBackTheSame()
    {
        var dto = new WorkMasterEventDtoV1
        {
            Timestamp = new DateTime(2026, 11, 17, 9, 21, 40, DateTimeKind.Utc),
            Id = "7a1c",
            MId = "P-04",
            Action = WorkMasterAction.Ended,
            CorrelationId = "exec-1",
            ExecutionId = "exec-1",
            WorkMasterId = "WM-SHAFT-4711",
            JobOrderId = "4711/01",
            State = "Ended",
            StartTime = new DateTime(2026, 11, 17, 8, 31, 0, DateTimeKind.Utc),
            Duration = 3040,
            PartsProduced = 1,
            EnergyElectricity = 6_661_800,
            Seq = 1842,
        };

        var json = JsonSerializer.Serialize(dto, Json);

        Assert.AreEqual("Ended", Value(JsonNode.Parse(json)!.AsObject(), "Action"));
        Assert.AreEqual(dto, JsonSerializer.Deserialize<WorkMasterEventDtoV1>(json, Json));
    }

    private static string? Value(JsonObject node, string name)
    {
        // The property naming of the default options decides the case; the enum is a name either way.
        var property = node.FirstOrDefault(p => string.Equals(p.Key, name, StringComparison.OrdinalIgnoreCase));
        return property.Value?.GetValue<string>();
    }
}
