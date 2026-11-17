// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class JobOrderProjectionsTest
{
    private static readonly int[] SecondPageDescending = [8, 7, 6];
    private static readonly string[] OrderNumbers = ["SO-4711"];

    private static List<JobEventDtoV1> Jobs(string mId = "P-04", string jobOrderId = "4711/01")
    {
        return EventsMapper.Map(JobEventSamples.OneJobOrder(mId, jobOrderId));
    }

    private static List<WorkMasterEventDtoV1> Executions(string mId = "P-04", string jobOrderId = "4711/01", string executionId = "exec-1")
    {
        return EventsMapper.Map(JobEventSamples.OneExecution(mId, jobOrderId, executionId));
    }

    [TestMethod]
    public void PairProgramExecutions_PairsStartedWithEnded_WithItsSums()
    {
        var pair = JobOrderProjections.PairProgramExecutions(Executions()).Single();

        Assert.AreEqual("exec-1", pair.ExecutionId);
        Assert.AreEqual("P-04", pair.MId);
        Assert.AreEqual("4711/01", pair.JobOrderId);
        Assert.AreEqual("WM-SHAFT-4711", pair.WorkMasterId);
        Assert.AreEqual("Ended", pair.State);
        Assert.AreEqual(WorkMasterAction.Ended, pair.EndAction);
        Assert.AreEqual(JobEventSamples.Start.AddMinutes(3), pair.StartTime);
        Assert.AreEqual(JobEventSamples.Start.AddMinutes(7), pair.EndTime);
        Assert.AreEqual(1, pair.Interruptions);
        Assert.AreEqual(240, pair.Duration);
        Assert.AreEqual(1, pair.PartsProduced);
        Assert.AreEqual(720_000, pair.EnergyElectricity);
    }

    [TestMethod]
    public void PairProgramExecutions_WithoutAnEnd_IsStillRunning()
    {
        var pair = JobOrderProjections.PairProgramExecutions(Executions().Where(e => e.Action != WorkMasterAction.Ended)).Single();

        Assert.AreEqual("Running", pair.State);
        Assert.IsNull(pair.EndTime);
        Assert.IsNull(pair.EndAction);
        Assert.IsNull(pair.Duration);
    }

    [TestMethod]
    public void PairProgramExecutions_WithoutItsStartInTheRange_KnowsItsStartFromALaterEvent()
    {
        // Each event carries the whole state: an execution whose Started lies before the time range still has its start.
        var pair = JobOrderProjections.PairProgramExecutions(Executions().Where(e => e.Timestamp >= JobEventSamples.Start.AddMinutes(5))).Single();

        Assert.AreEqual(JobEventSamples.Start.AddMinutes(3), pair.StartTime);
        Assert.AreEqual(WorkMasterAction.Ended, pair.EndAction);
    }

    [TestMethod]
    public void PairProgramExecutions_KeepsAbortedApartAndMachinesApart()
    {
        var aborted = Executions("M-02", "8801/01", "exec-2")
            .Select(e => e.Action == WorkMasterAction.Ended ? e with { Action = WorkMasterAction.Aborted, State = "Aborted", PartsProduced = 0 } : e);
        var pairs = JobOrderProjections.PairProgramExecutions(Executions().Concat(aborted));

        Assert.HasCount(2, pairs);
        var m02 = pairs.Single(p => p.MId == "M-02");
        Assert.AreEqual(WorkMasterAction.Aborted, m02.EndAction);
        Assert.AreEqual(0, m02.PartsProduced);
    }

    [TestMethod]
    public void JobOrders_TakeTheOrderAndTheResultOfTheLastEvent_AndAddUpTheirExecutions()
    {
        var jobOrder = JobOrderProjections.JobOrders(Jobs(), Executions()).Single();

        Assert.AreEqual("P-04", jobOrder.MId);
        Assert.AreEqual("4711/01", jobOrder.JobOrderId);
        Assert.AreEqual("Ended", jobOrder.State);
        Assert.AreEqual(JobAction.ResultChanged, jobOrder.LastAction);
        Assert.AreEqual(JobEventSamples.Start.AddMinutes(8), jobOrder.LastChange);
        Assert.AreEqual(JobEventSamples.Start, jobOrder.FirstSeen);
        Assert.AreEqual("WM-SHAFT-4711", jobOrder.WorkMasterId);
        Assert.AreEqual(1, jobOrder.RunsPlanned);
        CollectionAssert.AreEqual(OrderNumbers, jobOrder.OrderNumbers!.ToList());
        Assert.AreEqual(JobEventSamples.Start.AddMinutes(2), jobOrder.StartTime);
        Assert.AreEqual(JobEventSamples.Start.AddMinutes(8), jobOrder.EndTime);
        Assert.AreEqual(1, jobOrder.ProducedQuantity);
        Assert.AreEqual(1, jobOrder.GoodQuantity);
        Assert.AreEqual(1, jobOrder.RunsCompleted);
        Assert.AreEqual("Successful", jobOrder.JobResult);
        Assert.AreEqual(1, jobOrder.ProgramExecutions);
        Assert.AreEqual(720_000, jobOrder.EnergyElectricity);
        Assert.IsFalse(jobOrder.Removed);
    }

    [TestMethod]
    public void JobOrders_BeforeTheStart_HaveNoResult()
    {
        var jobOrder = JobOrderProjections.JobOrders(Jobs().Take(2), []).Single();

        Assert.AreEqual("AllowedToStart", jobOrder.State);
        Assert.IsNull(jobOrder.StartTime);
        Assert.IsNull(jobOrder.ProducedQuantity);
        Assert.IsNull(jobOrder.JobResult);
        Assert.AreEqual(0, jobOrder.ProgramExecutions);
    }

    [TestMethod]
    public void JobOrders_InAnyOrder_GiveTheSameState()
    {
        var shuffled = Jobs().OrderByDescending(e => e.Id, StringComparer.Ordinal).ToList();
        var inOrder = JobOrderProjections.JobOrders(Jobs(), Executions()).Single();
        var fromShuffled = JobOrderProjections.JobOrders(shuffled, Executions()).Single();
        Assert.AreEqual(inOrder with { OrderNumbers = null }, fromShuffled with { OrderNumbers = null });
    }

    [TestMethod]
    public void JobOrders_TakenBack_AreMarkedRemoved()
    {
        var events = Jobs().Take(2).ToList();
        events.Add(events[1] with { Id = "removed", Timestamp = JobEventSamples.Start.AddMinutes(9), Action = JobAction.Removed, Seq = 99 });

        var jobOrder = JobOrderProjections.JobOrders(events, []).Single();

        Assert.IsTrue(jobOrder.Removed);
        Assert.AreEqual("AllowedToStart", jobOrder.State);
    }

    [TestMethod]
    public void History_GivesTheJobOrderItsEventsAndItsExecutions_OrNullForAnUnknownOne()
    {
        var jobs = Jobs().Concat(Jobs("P-07", "5101/01"));
        var executions = Executions().Concat(Executions("P-07", "5101/01", "exec-9"));
        var history = JobOrderProjections.History(jobs, executions, "P-04", "4711/01")!;

        Assert.AreEqual("4711/01", history.JobOrder.JobOrderId);
        Assert.HasCount(6, history.History);
        Assert.IsTrue(history.History.All(e => e.MId == "P-04"));
        CollectionAssert.AreEqual(history.History.OrderBy(e => e.Timestamp).ThenBy(e => e.Seq).ToList(), history.History.ToList());
        Assert.AreEqual("exec-1", history.ProgramExecutions.Single().ExecutionId);
        Assert.IsNull(JobOrderProjections.History(jobs, executions, "P-04", "9999/01"));
    }

    [TestMethod]
    public void Page_SortsAndCuts()
    {
        var items = Enumerable.Range(1, 10).ToList();
        var (page, total) = JobOrderProjections.Page(items, i => i, new PagedRequest(2, 3, Sorting.Descending));

        Assert.AreEqual(10, total);
        CollectionAssert.AreEqual(SecondPageDescending, page);
    }
}
