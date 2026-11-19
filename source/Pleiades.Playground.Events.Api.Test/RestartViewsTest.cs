// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>
/// What the views make of a new start of the adapter (a new prefix of <c>sequence</c>) and of a gap: an alert or a
/// program execution of an earlier run that the new run does not name again ends with the start of the next run,
/// marked AdapterRestart; a job order is never closed, only stale; a gap after the last event makes it stale.
/// </summary>
[TestClass]
public sealed class RestartViewsTest
{
    private const string Machine = MachineEventSamples.MachineId;
    private const string FirstRun = MachineEventSamples.Prefix;
    private const string SecondRun = "20261117T063000Z";
    private static readonly DateTime Start = MachineEventSamples.Start;
    private static readonly DateTime SecondStart = Start.AddMinutes(30);

    [TestMethod]
    public void AnAlertOfAnEarlierRun_IsClearedByTheRestart_AtTheStartOfTheNextRun()
    {
        var stored = Stored(
            Event(FirstRun, "Notification.AlertRaised", 4, 1, Alert("a-1", 4)),
            Event(SecondRun, "JobMonitoring.JobOrderChanged", 31, 1, Job("4712/01", "AllowedToStart")));
        var runs = Runs(stored);
        var events = MachineEventMapper.ToDtos(stored);

        var pair = MachineEventViews.AlertPairs(events, runs: runs).Single();

        Assert.IsEmpty(MachineEventViews.ActiveAlerts(events, runs), "it does not stand any more");
        Assert.AreEqual(MachineEventViews.AdapterRestart, pair.ClearedBy);
        Assert.AreEqual(SecondStart, pair.ClearedAt, "the start of the next run, from its prefix");
        Assert.AreEqual(26 * 60, pair.DurationSeconds, "at most until the restart");
        Assert.IsFalse(pair.Stale);
        var statistic = MachineEventViews.AlertStatistics([pair]).Single();
        Assert.AreEqual(0, statistic.Active);
        Assert.AreEqual(26 * 60, statistic.TotalDurationSeconds);
        Assert.HasCount(1, MachineEventViews.ActiveAlerts(events), "without the runs, the events alone");
    }

    [TestMethod]
    public void AnAlertTheNextRunNamesAgain_Stands_AndOneClearedByItsEvent_SaysSo()
    {
        var stored = Stored(
            Event(FirstRun, "Notification.AlertRaised", 4, 1, Alert("a-1", 4)),
            Event(FirstRun, "Notification.AlertRaised", 5, 2, Alert("a-2", 5)),
            Event(FirstRun, "Notification.AlertCleared", 6, 3, Alert("a-2", 5)),
            Event(SecondRun, "Notification.AlertRaised", 31, 1, Alert("a-1", 4)));
        var runs = Runs(stored);
        var events = MachineEventMapper.ToDtos(stored);

        var pairs = MachineEventViews.AlertPairs(events, runs: runs);

        Assert.AreEqual("a-1", MachineEventViews.ActiveAlerts(events, runs).Single().AlertId);
        Assert.IsNull(pairs.Single(p => p.AlertId == "a-1").ClearedBy);
        Assert.AreEqual(MachineEventViews.ByEvent, pairs.Single(p => p.AlertId == "a-2").ClearedBy);
    }

    [TestMethod]
    public void AnAlertWithAGapAfterItsLastEvent_StandsAndIsStale()
    {
        var stored = Stored(
            Event(FirstRun, "Notification.AlertRaised", 4, 1, Alert("a-1", 4)),
            Event(FirstRun, "Notification.AlertRaised", 8, 3, Alert("a-2", 8)));
        var runs = Runs(stored);

        var active = MachineEventViews.ActiveAlerts(MachineEventMapper.ToDtos(stored), runs);

        Assert.HasCount(2, active);
        Assert.IsTrue(active.Single(a => a.AlertId == "a-1").Stale, "its clear may have been count 2");
        Assert.IsFalse(active.Single(a => a.AlertId == "a-2").Stale, "nothing is missing after it");
    }

    [TestMethod]
    public void AProgramExecutionOfAnEarlierRun_EndsWithTheRestart_WithoutSums()
    {
        var stored = Stored(
            Event(FirstRun, "WorkMasterMonitoring.ProgramExecutionStarted", 3, 1, Execution("exec-1", "Running")),
            Event(FirstRun, "WorkMasterMonitoring.ProgramExecutionStarted", 10, 2, Execution("exec-2", "Running")),
            Event(FirstRun, "WorkMasterMonitoring.ProgramExecutionEnded", 12, 3, Execution("exec-2", "Ended")),
            Event(SecondRun, "JobMonitoring.JobOrderChanged", 31, 1, Job("4712/01", "AllowedToStart")));

        var executions = MachineEventViews.ProgramExecutions(MachineEventMapper.ToDtos(stored), Runs(stored));

        var lost = executions.Single(p => p.ExecutionId == "exec-1");
        Assert.AreEqual(MachineEventViews.AdapterRestart, lost.EndType);
        Assert.AreEqual(SecondStart, lost.EndTime);
        Assert.IsNull(lost.Duration);
        Assert.IsNull(lost.EnergyElectricity);
        Assert.AreEqual("Ended", executions.Single(p => p.ExecutionId == "exec-2").EndType);
    }

    [TestMethod]
    public void AProgramExecutionWithAGapAfterItsLastEvent_RunsAndIsStale()
    {
        var stored = Stored(
            Event(FirstRun, "WorkMasterMonitoring.ProgramExecutionStarted", 3, 1, Execution("exec-1", "Running")),
            Event(FirstRun, "WorkMasterMonitoring.ProgramExecutionStarted", 9, 4, Execution("exec-2", "Running")));

        var executions = MachineEventViews.ProgramExecutions(MachineEventMapper.ToDtos(stored), Runs(stored));

        var first = executions.Single(p => p.ExecutionId == "exec-1");
        Assert.IsNull(first.EndType);
        Assert.IsTrue(first.Stale);
        Assert.IsFalse(executions.Single(p => p.ExecutionId == "exec-2").Stale);
    }

    [TestMethod]
    public void AJobOrderOfAnEarlierRun_IsStale_NeverClosed_UntilItsNextEvent()
    {
        var stored = Stored(
            Event(FirstRun, "JobMonitoring.JobOrderStarted", 2, 1, Job("4711/01", "Running")),
            Event(FirstRun, "JobMonitoring.JobOrderChanged", 3, 2, Job("4709/01", "Ended")),
            Event(FirstRun, "JobMonitoring.JobOrderChanged", 4, 3, Job("4710/01", "AllowedToStart")),
            Event(SecondRun, "JobMonitoring.JobOrderChanged", 31, 1, Job("4710/01", "AllowedToStart")));

        var jobs = MachineEventViews.JobOrders(MachineEventMapper.ToDtos(stored), [], Runs(stored));

        var running = jobs.Single(j => j.JobOrderId == "4711/01");
        Assert.IsTrue(running.Stale);
        Assert.AreEqual("Running", running.State, "a job order outlives its adapter: not closed");
        Assert.IsFalse(jobs.Single(j => j.JobOrderId == "4709/01").Stale, "an ended job order is not stale");
        Assert.IsFalse(jobs.Single(j => j.JobOrderId == "4710/01").Stale, "the new run named it again");
    }

    [TestMethod]
    public void ARunWithAPrefixOfAnotherFormat_StartsWithItsFirstEvent()
    {
        var stored = Stored(
            Event("run-1", "Notification.AlertRaised", 4, 1, Alert("a-1", 4)),
            Event("run-2", "JobMonitoring.JobOrderChanged", 40, 1, Job("4712/01", "AllowedToStart")));

        var pair = MachineEventViews.AlertPairs(MachineEventMapper.ToDtos(stored), runs: Runs(stored)).Single();

        Assert.AreEqual(MachineEventViews.AdapterRestart, pair.ClearedBy);
        Assert.AreEqual(Start.AddMinutes(40), pair.ClearedAt);
    }

    private static MachineEventDao Event(string prefix, string type, int minute, long count, JsonObject data)
    {
        var cloudEvent = MachineEventSamples.CloudEvent(type, minute, count, data, id: $"{prefix}-{type}-{count}", prefix: prefix);
        return MachineEventMapper.ToDao(Machine, cloudEvent, Start.AddHours(1));
    }

    private static List<MachineEventDao> Stored(params MachineEventDao[] events) => [.. events];

    /// <summary>The runs and the gaps inside them, as the endpoints read them.</summary>
    private static RunContext Runs(List<MachineEventDao> stored)
    {
        var runs = MachineEventViews.Runs(stored);
        var gaps = MachineEventViews.Gaps(
            runs,
            run => [.. stored.Where(e => e.MId == run.MId && e.Group == run.Group && e.SequencePrefix == run.Prefix).Select(e => e.SequenceCount!.Value)],
            _ => false);
        return RunContext.From(runs, gaps);
    }

    private static JsonObject Alert(string id, int minute) => new()
    {
        ["Id"] = id,
        ["ErrorCode"] = "20017",
        ["Message"] = "Coolant pressure low",
        ["Severity"] = "OffSpec",
        ["SeverityValue"] = 500,
        ["Time"] = Start.AddMinutes(minute).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture),
    };

    private static JsonObject Execution(string id, string state) => new()
    {
        ["ExecutionId"] = id,
        ["State"] = state,
        ["JobOrderID"] = "4711/01",
        ["ActiveWorkMaster"] = "WM-SHAFT-4711",
        ["Duration"] = 120.0,
        ["EnergyElectricity"] = 50.0,
    };

    private static JsonObject Job(string id, string state) => new()
    {
        ["JobOrderID"] = id,
        ["State"] = state,
    };
}
