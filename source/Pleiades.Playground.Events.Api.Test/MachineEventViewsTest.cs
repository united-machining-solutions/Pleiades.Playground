// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using System.Text.Json.Nodes;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class MachineEventViewsTest
{
    private static readonly DateTime Start = MachineEventSamples.Start;
    private static readonly string[] OrderNumbers = ["SO-4711"];
    private static readonly int[] SecondPageDescending = [8, 7, 6];
    private static readonly string[] OnlyOffSpec = ["a-2"];
    private static readonly string[] OnlyFailure = ["a-1"];
    private static readonly string[] FailureThenOffSpec = ["Failure", "OffSpec"];

    [TestMethod]
    public void Mapper_KeepsTheCloudEventAsItCame_AndReadsItsAttributes()
    {
        var cloudEvent = MachineEventSamples.CloudEvent("Notification.AlertRaised", 4, 42, new JsonObject { ["Id"] = "a" }, "exec-1", id: "e-42");
        var dao = MachineEventMapper.ToDao(MachineEventSamples.MachineId, cloudEvent, Start);

        Assert.AreEqual($"{MachineEventSamples.Source} e-42", dao.Key, "unique by source and id");
        Assert.AreEqual("Notification", dao.Group);
        Assert.AreEqual(MachineEventSamples.Prefix, dao.SequencePrefix);
        Assert.AreEqual(42, dao.SequenceCount);
        Assert.AreEqual("exec-1", dao.CorrelationId);
        Assert.AreEqual(Start.AddMinutes(4), dao.Time);
        Assert.AreEqual("urn:umati2:datamodel:0.17.1:event.schema.json", dao.Event["dataschema"].AsString, "the whole event is kept");

        var dto = MachineEventMapper.ToDto(dao);
        Assert.AreEqual("e-42", dto.Id);
        Assert.AreEqual("a", dto.Data.GetProperty("Id").GetString());
    }

    [TestMethod]
    [DataRow("""{ "id": "x", "source": "s", "type": "t", "time": "2026-11-17T06:00:00Z", "data": {} }""", "specversion")]
    [DataRow("""{ "specversion": "1.0", "source": "s", "type": "t", "time": "2026-11-17T06:00:00Z", "data": {} }""", "id")]
    [DataRow("""{ "specversion": "1.0", "id": "x", "source": "s", "type": "t", "data": {} }""", "time")]
    [DataRow("""{ "specversion": "1.0", "id": "x", "source": "s", "type": "t", "time": "2026-11-17T06:00:00Z", "data": 3 }""", "data")]
    public void Mapper_RefusesWhatIsNoCloudEvent(string json, string missing)
    {
        using var document = JsonDocument.Parse(json);
        var error = Assert.ThrowsExactly<ArgumentException>(() => MachineEventMapper.ToDao("m", document.RootElement, Start));
        Assert.Contains(missing, error.Message, StringComparison.Ordinal);
    }

    [TestMethod]
    public void AlertPairs_PairRaisedWithCleared_ByTheIdOfTheAlert()
    {
        var pairs = MachineEventViews.AlertPairs(MachineEventSamples.Shift());

        Assert.HasCount(2, pairs);
        var failure = pairs.Single(p => p.AlertId == "a-1");
        Assert.AreEqual("Failure", failure.Severity);
        Assert.AreEqual(Start.AddMinutes(4), failure.RaisedAt);
        Assert.AreEqual(Start.AddMinutes(5), failure.ClearedAt);
        Assert.AreEqual(60, failure.DurationSeconds);
        Assert.AreEqual("exec-1", failure.CorrelationId);

        var offSpec = pairs.Single(p => p.AlertId == "a-2");
        Assert.IsNull(offSpec.ClearedAt, "it still stands");
        Assert.AreEqual(700, offSpec.SeverityValue, "the fields of its last event");
        Assert.AreEqual(Start.AddMinutes(7), offSpec.LastChange);
    }

    [TestMethod]
    public void AlertPairs_InARange_AreThoseThatStoodInIt()
    {
        var shift = MachineEventSamples.Shift();

        CollectionAssert.AreEqual(OnlyOffSpec, MachineEventViews.AlertPairs(shift, from: Start.AddMinutes(5.5)).Select(p => p.AlertId).ToList(),
            "the failure was cleared before");
        CollectionAssert.AreEqual(OnlyFailure, MachineEventViews.AlertPairs(shift, to: Start.AddMinutes(5.5)).Select(p => p.AlertId).ToList(),
            "the alert OffSpec came up after");
    }

    [TestMethod]
    public void ActiveAlerts_AndStatistics_BySeverity()
    {
        var shift = MachineEventSamples.Shift();

        var active = MachineEventViews.ActiveAlerts(shift).Single();
        Assert.AreEqual("a-2", active.AlertId);
        Assert.AreEqual("OffSpec", active.Severity);

        var statistics = MachineEventViews.AlertStatistics(MachineEventViews.AlertPairs(shift));
        CollectionAssert.AreEqual(FailureThenOffSpec, statistics.Select(s => s.Severity).ToList(), "in the order of NE 107");
        Assert.AreEqual(1, statistics[0].Raised);
        Assert.AreEqual(0, statistics[0].Active);
        Assert.AreEqual(60, statistics[0].TotalDurationSeconds);
        Assert.AreEqual(1, statistics[1].Active);
    }

    [TestMethod]
    public void ProgramExecutions_PairStartedWithEnded_WithTheSumsOfTheEnd()
    {
        var execution = MachineEventViews.ProgramExecutions(MachineEventSamples.Shift()).Single();

        Assert.AreEqual("exec-1", execution.ExecutionId);
        Assert.AreEqual("4711/01", execution.JobOrderId);
        Assert.AreEqual("WM-SHAFT-4711", execution.WorkMasterId);
        Assert.AreEqual("Ended", execution.State);
        Assert.AreEqual("Ended", execution.EndType);
        Assert.AreEqual(Start.AddMinutes(3), execution.StartTime);
        Assert.AreEqual(Start.AddMinutes(7), execution.EndTime);
        Assert.AreEqual(1, execution.Interruptions);
        Assert.AreEqual(240, execution.Duration);
        Assert.AreEqual(200.5, execution.EnergyElectricity, "in watt hours, as delivered");

        var running = MachineEventViews.ProgramExecutions(MachineEventSamples.Shift().Where(e => e.Type != "WorkMasterMonitoring.ProgramExecutionEnded")).Single();
        Assert.AreEqual("Running", running.State);
        Assert.IsNull(running.EndTime);
        Assert.IsNull(running.Duration);
    }

    [TestMethod]
    public void JobOrders_TakeTheOrderOfTheLastJobEvent_AndTheLastResult()
    {
        var shift = MachineEventSamples.Shift();
        var jobOrder = MachineEventViews.JobOrders(shift, shift).Single();

        Assert.AreEqual(MachineEventSamples.MachineId, jobOrder.MId);
        Assert.AreEqual("4711/01", jobOrder.JobOrderId);
        Assert.AreEqual("Ended", jobOrder.State);
        Assert.AreEqual("JobMonitoring.JobOrderResultChanged", jobOrder.LastType);
        Assert.AreEqual(Start, jobOrder.FirstSeen);
        Assert.AreEqual("WM-SHAFT-4711", jobOrder.WorkMasterId);
        CollectionAssert.AreEqual(OrderNumbers, jobOrder.OrderNumbers!.ToList());
        Assert.AreEqual(Start.AddMinutes(2), jobOrder.StartTime);
        Assert.AreEqual(Start.AddMinutes(8), jobOrder.EndTime);
        Assert.AreEqual(1, jobOrder.ProducedQuantity);
        Assert.AreEqual(1, jobOrder.RunsCompleted);
        Assert.AreEqual("Successful", jobOrder.JobResult);
        Assert.AreEqual(1, jobOrder.ProgramExecutions);
        Assert.AreEqual(200.5, jobOrder.EnergyElectricity);
        Assert.IsFalse(jobOrder.Removed);
    }

    [TestMethod]
    public void JobOrders_GetAResultWithTheirStart_NoneBefore()
    {
        var shift = MachineEventSamples.Shift();

        var released = MachineEventViews.JobOrders(shift.Take(2), []).Single();
        Assert.AreEqual("AllowedToStart", released.State);
        Assert.IsNull(released.StartTime);
        Assert.IsNull(released.ProducedQuantity);
        Assert.IsNull(released.JobResult);

        var started = MachineEventViews.JobOrders(shift.Take(3), []).Single();
        Assert.AreEqual(Start.AddMinutes(2), started.StartTime, "the result comes with JobOrderStarted");
        Assert.AreEqual(0, started.ProducedQuantity);
        Assert.AreEqual("Unknown", started.JobResult);
        Assert.IsNull(started.EndTime);
    }

    [TestMethod]
    public void History_GivesTheEventsAndTheExecutionsOfOneJobOrder_OrNull()
    {
        var shift = MachineEventSamples.Shift();
        var history = MachineEventViews.History(shift, shift, MachineEventSamples.MachineId, "4711/01")!;

        Assert.HasCount(6, history.History);
        Assert.IsTrue(history.History.All(e => e.Group == "JobMonitoring"));
        Assert.AreEqual("exec-1", history.ProgramExecutions.Single().ExecutionId);
        Assert.IsNull(MachineEventViews.History(shift, shift, MachineEventSamples.MachineId, "9999/01"));
    }

    [TestMethod]
    public void Gaps_ShowTheCountsThatNeverArrived_PerGroupAndRun()
    {
        var stored = MachineEventSamples.StoredShift()
            .Where(e => !(e.Group == "Notification" && e.SequenceCount is 2 or 3))
            .Where(e => !(e.Group == "JobMonitoring" && e.SequenceCount == 1))
            .ToList();

        var gaps = MachineEventViews.Gaps(stored, fromStart: true);

        Assert.HasCount(2, gaps);
        var jobs = gaps.Single(g => g.Group == "JobMonitoring");
        Assert.AreEqual(1, jobs.FirstMissing, "the run begins with 1");
        Assert.AreEqual(1, jobs.Missing);
        var notifications = gaps.Single(g => g.Group == "Notification");
        Assert.AreEqual(2, notifications.FirstMissing);
        Assert.AreEqual(3, notifications.LastMissing);
        Assert.AreEqual(2, notifications.Missing);
        Assert.AreEqual(MachineEventSamples.Prefix, notifications.Prefix);

        Assert.HasCount(1, MachineEventViews.Gaps(stored, fromStart: false), "without the start of the run, no gap before its first event");
        Assert.IsEmpty(MachineEventViews.Gaps(MachineEventSamples.StoredShift(), fromStart: true));
    }

    [TestMethod]
    public void Page_SortsAndCuts()
    {
        var (page, total) = MachineEventViews.Page(Enumerable.Range(1, 10).ToList(), i => i, new PagedRequest(2, 3, Sorting.Descending));

        Assert.AreEqual(10, total);
        CollectionAssert.AreEqual(SecondPageDescending, page);
    }
}
