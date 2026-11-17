// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>CloudEvents of a machine after the data model, as the simulator sends them, for the tests.</summary>
internal static class MachineEventSamples
{
    public const string MachineId = "alcyone-machines_AX-400_P-04";
    public const string Source = "https://www.alcyone-machines.example/AX-400/P-04";
    public const string Prefix = "20261117T060000Z";
    public static readonly DateTime Start = new(2026, 11, 17, 6, 0, 0, DateTimeKind.Utc);

    private static string Iso(DateTime time) => time.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>A CloudEvent 1.0 in structured mode.</summary>
    public static JsonElement CloudEvent(string type, int minute, long count, JsonObject data, string? correlationId = null, string? id = null)
    {
        var cloudEvent = new JsonObject
        {
            ["specversion"] = "1.0",
            ["id"] = id ?? $"{type}-{count}",
            ["source"] = Source,
            ["type"] = type,
            ["time"] = Iso(Start.AddMinutes(minute)),
            ["sequence"] = $"{Prefix}.{count:D12}",
            ["dataschema"] = "urn:umati2:datamodel:0.17.1:event.schema.json",
            ["data"] = data,
        };
        if (correlationId is not null)
        {
            cloudEvent["correlationid"] = correlationId;
        }
        return JsonSerializer.SerializeToElement(cloudEvent);
    }

    private static JsonObject Job(string state, int sinceMinute) => new()
    {
        ["JobOrderID"] = "4711/01",
        ["State"] = state,
        ["StateSince"] = Iso(Start.AddMinutes(sinceMinute)),
        ["JobName"] = "Shaft 4711",
        ["WorkMasterID"] = "WM-SHAFT-4711",
        ["OrderNumbers"] = new JsonArray("SO-4711"),
        ["RunsPlanned"] = 1,
        ["JobExecutionMode"] = "ProductionMode",
        ["PlannedStartTime"] = null,
        ["PlannedEndTime"] = null,
    };

    private static JsonObject Result(int produced, bool ended) => new()
    {
        ["JobOrderID"] = "4711/01",
        ["StartTime"] = Iso(Start.AddMinutes(2)),
        ["EndTime"] = ended ? Iso(Start.AddMinutes(8)) : null,
        ["ProducedQuantity"] = produced,
        ["GoodQuantity"] = produced,
        ["RunsCompleted"] = produced,
        ["ActualProductionTime"] = 300.0,
        ["JobResult"] = ended ? "Successful" : "Unknown",
    };

    private static JsonObject Execution(string state, bool end) => new()
    {
        ["ExecutionId"] = "exec-1",
        ["JobOrderID"] = "4711/01",
        ["ActiveWorkMaster"] = "WM-SHAFT-4711",
        ["State"] = state,
        ["StartTime"] = Iso(Start.AddMinutes(3)),
        ["Duration"] = end ? 240.0 : null,
        ["PartsProduced"] = end ? 1 : null,
        ["EnergyElectricity"] = end ? 200.5 : null,
    };

    private static JsonObject Alert(string id, string severity, int minute, int? severityValue = null) => new()
    {
        ["Id"] = id,
        ["ErrorCode"] = severity == "Failure" ? "30001" : "20017",
        ["Message"] = severity == "Failure" ? "Spindle overload" : "Coolant pressure low",
        ["Severity"] = severity,
        ["SeverityValue"] = severityValue,
        ["Time"] = Iso(Start.AddMinutes(minute)),
        ["SourceName"] = "Spindle",
        ["correlationId"] = "exec-1",
    };

    /// <summary>
    /// One job order 4711/01 (added, released, started, a part, ended), its program execution (started,
    /// interrupted, resumed, ended with one part and 200.5 Wh), a failure raised at minute 4 and cleared at minute 5,
    /// and an alert OffSpec raised at minute 6, changed at minute 7, still standing.
    /// </summary>
    public static List<(string MId, JsonElement CloudEvent)> OneShift()
    {
        return
        [
            (MachineId, CloudEvent("JobMonitoring.JobOrderAdded", 0, 1, Job("NotAllowedToStart", 0))),
            (MachineId, CloudEvent("JobMonitoring.JobOrderReleased", 1, 2, Job("AllowedToStart", 1))),
            (MachineId, CloudEvent("JobMonitoring.JobOrderStarted", 2, 3, Job("Running", 2))),
            (MachineId, CloudEvent("WorkMasterMonitoring.ProgramExecutionStarted", 3, 1, Execution("Running", false), "exec-1")),
            (MachineId, CloudEvent("Notification.AlertRaised", 4, 1, Alert("a-1", "Failure", 4, 900), "exec-1")),
            (MachineId, CloudEvent("WorkMasterMonitoring.ProgramExecutionInterrupted", 4, 2, Execution("Interrupted", false), "exec-1")),
            (MachineId, CloudEvent("Notification.AlertCleared", 5, 2, Alert("a-1", "Failure", 4, 900), "exec-1")),
            (MachineId, CloudEvent("WorkMasterMonitoring.ProgramExecutionResumed", 5, 3, Execution("Running", false), "exec-1")),
            (MachineId, CloudEvent("Notification.AlertRaised", 6, 3, Alert("a-2", "OffSpec", 6, 500))),
            (MachineId, CloudEvent("WorkMasterMonitoring.ProgramExecutionEnded", 7, 4, Execution("Ended", true), "exec-1")),
            (MachineId, CloudEvent("JobMonitoring.JobOrderResultChanged", 7, 4, Result(1, false))),
            (MachineId, CloudEvent("Notification.AlertChanged", 7, 4, Alert("a-2", "OffSpec", 6, 700))),
            (MachineId, CloudEvent("JobMonitoring.JobOrderEnded", 8, 5, Job("Ended", 8))),
            (MachineId, CloudEvent("JobMonitoring.JobOrderResultChanged", 8, 6, Result(1, true))),
        ];
    }

    /// <summary>The events of <see cref="OneShift"/> as stored.</summary>
    public static List<MachineEventDao> StoredShift() => [.. OneShift().Select(e => MachineEventMapper.ToDao(e.MId, e.CloudEvent, Start.AddMinutes(9)))];

    /// <summary>The events of <see cref="OneShift"/> as the API gives them.</summary>
    public static List<MachineEventDtoV1> Shift() => MachineEventMapper.ToDtos(StoredShift());
}
