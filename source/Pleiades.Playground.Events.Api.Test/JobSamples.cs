// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json.Nodes;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>
/// One job of a MES, J-100/01, that passes three machines with the same job order id: a mill, a grinder and a
/// measuring machine. Times are minutes from <see cref="MachineEventSamples.Start"/>.
/// </summary>
internal static class JobSamples
{
    public const string JobOrderId = "J-100/01";
    public const string Mill = "alcyone-machines_MX-200_M-02";
    public const string Grinder = "alcyone-machines_GX-300_P-07";
    public const string Measuring = "alcyone-machines_AX-400_P-04";

    private static readonly DateTime Start = MachineEventSamples.Start;

    private static string Iso(int minute) => Start.AddMinutes(minute).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private static JsonObject Order(string state, int since, string orderNumber = "SO-100", int? plannedStart = null) => new()
    {
        ["JobOrderID"] = JobOrderId,
        ["State"] = state,
        ["StateSince"] = Iso(since),
        ["JobName"] = "Shaft 100",
        ["WorkMasterID"] = "WM-SHAFT-100",
        ["OrderNumbers"] = new JsonArray(orderNumber),
        ["RunsPlanned"] = 2,
        ["JobExecutionMode"] = "ProductionMode",
        ["PlannedStartTime"] = plannedStart is { } p ? Iso(p) : null,
        ["PlannedEndTime"] = null,
    };

    private static JsonObject Result(int start, int? end, int produced) => new()
    {
        ["JobOrderID"] = JobOrderId,
        ["StartTime"] = Iso(start),
        ["EndTime"] = end is { } e ? Iso(e) : null,
        ["ProducedQuantity"] = produced,
        ["GoodQuantity"] = produced,
        ["RunsCompleted"] = produced,
        ["ActualProductionTime"] = 60.0 * produced,
        ["JobResult"] = end is null ? "Unknown" : "Successful",
    };

    private static JsonObject Execution(string id, string state, int start, bool end, double energy) => new()
    {
        ["ExecutionId"] = id,
        ["JobOrderID"] = JobOrderId,
        ["ActiveWorkMaster"] = "WM-SHAFT-100",
        ["State"] = state,
        ["StartTime"] = Iso(start),
        ["Duration"] = end ? 120.0 : null,
        ["PartsProduced"] = end ? 1 : null,
        ["EnergyElectricity"] = end ? energy : null,
        ["EnergyCompressedAir"] = end ? 1.5 : null,
    };

    private static (string, System.Text.Json.JsonElement) Job(string machine, string type, int minute, long count, JsonObject data)
        => (machine, MachineEventSamples.CloudEvent("JobMonitoring." + type, minute, count, data, id: $"{machine}-{type}-{count}"));

    private static (string, System.Text.Json.JsonElement) Run(string machine, string type, int minute, long count, JsonObject data, string executionId)
        => (machine, MachineEventSamples.CloudEvent("WorkMasterMonitoring." + type, minute, count, data, executionId, $"{machine}-{type}-{count}"));

    /// <summary>
    /// The mill runs the job from minute 10 to 20 with two program executions; the grinder from minute 30 to 40 with
    /// one; the measuring machine has it on its list, released, not started. The measuring machine had a job order
    /// with the same id before it started anew (minutes 0 to 5, one program execution of 999 Wh), which is no part
    /// of this job.
    /// </summary>
    public static List<(string MId, System.Text.Json.JsonElement CloudEvent)> AcrossThreeMachines()
    {
        return
        [
            // An earlier life of the id on the measuring machine, before its simulator started anew.
            Job(Measuring, "JobOrderAdded", 0, 1, Order("NotAllowedToStart", 0)),
            Job(Measuring, "JobOrderStarted", 1, 2, Order("Running", 1)),
            Job(Measuring, "JobOrderResultChanged", 1, 3, Result(1, null, 0)),
            Run(Measuring, "ProgramExecutionStarted", 2, 1, Execution("old-1", "Running", 2, false, 0), "old-1"),
            Run(Measuring, "ProgramExecutionEnded", 4, 2, Execution("old-1", "Ended", 2, true, 999), "old-1"),
            Job(Measuring, "JobOrderEnded", 5, 4, Order("Ended", 5)),
            Job(Measuring, "JobOrderResultChanged", 5, 5, Result(1, 5, 1)),
            Job(Measuring, "JobOrderRemoved", 6, 6, Order("Ended", 5)),

            // Step 1: the mill.
            Job(Mill, "JobOrderAdded", 8, 1, Order("NotAllowedToStart", 8)),
            Job(Mill, "JobOrderReleased", 9, 2, Order("AllowedToStart", 9)),
            Job(Mill, "JobOrderStarted", 10, 3, Order("Running", 10)),
            Job(Mill, "JobOrderResultChanged", 10, 4, Result(10, null, 0)),
            Run(Mill, "ProgramExecutionStarted", 11, 1, Execution("m-1", "Running", 11, false, 0), "m-1"),
            Run(Mill, "ProgramExecutionEnded", 13, 2, Execution("m-1", "Ended", 11, true, 100), "m-1"),
            Run(Mill, "ProgramExecutionStarted", 14, 3, Execution("m-2", "Running", 14, false, 0), "m-2"),
            Run(Mill, "ProgramExecutionEnded", 16, 4, Execution("m-2", "Ended", 14, true, 50.25), "m-2"),
            Job(Mill, "JobOrderEnded", 20, 5, Order("Ended", 20)),
            Job(Mill, "JobOrderResultChanged", 20, 6, Result(10, 20, 2)),

            // Step 2: the grinder, ten minutes later.
            Job(Grinder, "JobOrderAdded", 9, 1, Order("NotAllowedToStart", 9)),
            Job(Grinder, "JobOrderReleased", 25, 2, Order("AllowedToStart", 25)),
            Job(Grinder, "JobOrderStarted", 30, 3, Order("Running", 30)),
            Job(Grinder, "JobOrderResultChanged", 30, 4, Result(30, null, 0)),
            Run(Grinder, "ProgramExecutionStarted", 31, 1, Execution("g-1", "Running", 31, false, 0), "g-1"),
            Run(Grinder, "ProgramExecutionEnded", 33, 2, Execution("g-1", "Ended", 31, true, 80), "g-1"),
            Job(Grinder, "JobOrderEnded", 40, 5, Order("Ended", 40)),
            Job(Grinder, "JobOrderResultChanged", 40, 6, Result(30, 40, 2)),

            // Step 3: the measuring machine, added anew after its restart, released, not started.
            Job(Measuring, "JobOrderAdded", 7, 7, Order("NotAllowedToStart", 7, plannedStart: 45)),
            Job(Measuring, "JobOrderReleased", 41, 8, Order("AllowedToStart", 41, plannedStart: 45)),
        ];
    }

    /// <summary>The events of <see cref="AcrossThreeMachines"/> as stored.</summary>
    public static List<MachineEventDao> Stored() =>
        [.. AcrossThreeMachines().Select(e => MachineEventMapper.ToDao(e.MId, e.CloudEvent, Start.AddMinutes(50)))];

    /// <summary>The events of <see cref="AcrossThreeMachines"/> as the API gives them.</summary>
    public static List<MachineEventDtoV1> Events() => MachineEventMapper.ToDtos(Stored());

    /// <summary>The same events with the measuring machine started at minute 46 and running.</summary>
    public static List<MachineEventDtoV1> WithMeasuringRunning()
    {
        var events = AcrossThreeMachines();
        events.Add(Job(Measuring, "JobOrderStarted", 46, 9, Order("Running", 46, plannedStart: 45)));
        events.Add(Job(Measuring, "JobOrderResultChanged", 46, 10, Result(46, null, 0)));
        events.Add(Run(Measuring, "ProgramExecutionStarted", 47, 3, Execution("p-1", "Running", 47, false, 0), "p-1"));
        return MachineEventMapper.ToDtos([.. events.Select(e => MachineEventMapper.ToDao(e.MId, e.CloudEvent, Start.AddMinutes(50)))]);
    }
}
