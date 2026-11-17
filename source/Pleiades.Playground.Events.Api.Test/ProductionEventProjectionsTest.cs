// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class ProductionEventProjectionsTest
{
    private static readonly int[] SecondPageDescending = [8, 7, 6];

    private static List<ProductionEventDtoV1> Events(string mId = "P-04", string jobOrderId = "4711/01", string executionId = "exec-1")
    {
        return EventsMapper.Map(ProductionEventSamples.OneJobOrderWithOneExecution(mId, jobOrderId, executionId));
    }

    [TestMethod]
    public void PairProgramExecutions_PairsStartedWithEnded_WithItsSums()
    {
        var pair = ProductionEventProjections.PairProgramExecutions(Events()).Single();

        Assert.AreEqual("exec-1", pair.ExecutionId);
        Assert.AreEqual("P-04", pair.MId);
        Assert.AreEqual("4711/01", pair.JobOrderId);
        Assert.AreEqual("SHAFT.MPF", pair.WorkMaster);
        Assert.AreEqual("Ended", pair.State);
        Assert.AreEqual(ProductionAction.Ended, pair.EndAction);
        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(3), pair.StartTime);
        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(7), pair.EndTime);
        Assert.AreEqual(1, pair.Interruptions);
        Assert.AreEqual(240, pair.Duration);
        Assert.AreEqual(1, pair.PartsProduced);
        Assert.AreEqual(720_000, pair.EnergyElectricity);
    }

    [TestMethod]
    public void PairProgramExecutions_WithoutAnEnd_IsStillRunning()
    {
        var running = Events().Where(e => e.Action != ProductionAction.Ended || e.Subject != ProductionSubject.ProgramExecution);
        var pair = ProductionEventProjections.PairProgramExecutions(running).Single();

        Assert.AreEqual("Running", pair.State);
        Assert.IsNull(pair.EndTime);
        Assert.IsNull(pair.EndAction);
        Assert.IsNull(pair.Duration);
    }

    [TestMethod]
    public void PairProgramExecutions_WithoutItsStartInTheRange_KnowsItsStartFromALaterEvent()
    {
        // Each event carries the whole state: an execution whose Started lies before the time range still has its start.
        var later = Events().Where(e => e.Timestamp >= ProductionEventSamples.Start.AddMinutes(5));
        var pair = ProductionEventProjections.PairProgramExecutions(later).Single();

        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(3), pair.StartTime);
        Assert.AreEqual(ProductionAction.Ended, pair.EndAction);
    }

    [TestMethod]
    public void PairProgramExecutions_KeepsAbortedApartAndMachinesApart()
    {
        var aborted = Events("M-02", "8801/01", "exec-2")
            .Select(e => e.Action == ProductionAction.Ended && e.Subject == ProductionSubject.ProgramExecution
                ? e with { Action = ProductionAction.Aborted, State = "Aborted", PartsProduced = 0 }
                : e);
        var pairs = ProductionEventProjections.PairProgramExecutions(Events().Concat(aborted));

        Assert.HasCount(2, pairs);
        var m02 = pairs.Single(p => p.MId == "M-02");
        Assert.AreEqual(ProductionAction.Aborted, m02.EndAction);
        Assert.AreEqual(0, m02.PartsProduced);
    }

    [TestMethod]
    public void JobOrders_TakeTheStateOfTheLastEvent_AndAddUpTheirExecutions()
    {
        var jobOrder = ProductionEventProjections.JobOrders(Events()).Single();

        Assert.AreEqual("P-04", jobOrder.MId);
        Assert.AreEqual("4711/01", jobOrder.JobOrderId);
        Assert.AreEqual("Ended", jobOrder.State);
        Assert.AreEqual(ProductionAction.Ended, jobOrder.LastAction);
        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(8), jobOrder.LastChange);
        Assert.AreEqual(ProductionEventSamples.Start, jobOrder.FirstSeen);
        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(2), jobOrder.StartTime);
        Assert.AreEqual(ProductionEventSamples.Start.AddMinutes(8), jobOrder.EndTime);
        Assert.AreEqual(1, jobOrder.ProducedQuantity);
        Assert.AreEqual(1, jobOrder.GoodQuantity);
        Assert.AreEqual(1, jobOrder.ProgramExecutions);
        Assert.AreEqual(720_000, jobOrder.EnergyElectricity);
        Assert.AreEqual("SHAFT.MPF", jobOrder.WorkMaster);
        Assert.IsFalse(jobOrder.Removed);
    }

    [TestMethod]
    public void JobOrders_InAnyOrder_GiveTheSameState()
    {
        var shuffled = Events().OrderByDescending(e => e.Id, StringComparer.Ordinal).ToList();
        Assert.AreEqual(ProductionEventProjections.JobOrders(Events()).Single(), ProductionEventProjections.JobOrders(shuffled).Single());
    }

    [TestMethod]
    public void JobOrders_TakenBack_AreMarkedRemoved()
    {
        var events = Events().Take(2).ToList();
        events.Add(events[1] with { Id = "removed", Timestamp = ProductionEventSamples.Start.AddMinutes(9), Action = ProductionAction.Removed, Seq = 99 });

        var jobOrder = ProductionEventProjections.JobOrders(events).Single();

        Assert.IsTrue(jobOrder.Removed);
        Assert.AreEqual("AllowedToStart", jobOrder.State);
        Assert.AreEqual(0, jobOrder.ProgramExecutions);
    }

    [TestMethod]
    public void History_GivesTheJobOrderAndItsEventsInOrder_OrNullForAnUnknownOne()
    {
        var history = ProductionEventProjections.History(Events().Concat(Events("P-07", "5101/01", "exec-9")), "P-04", "4711/01")!;

        Assert.AreEqual("4711/01", history.JobOrder.JobOrderId);
        Assert.HasCount(9, history.History);
        Assert.IsTrue(history.History.All(e => e.MId == "P-04"));
        CollectionAssert.AreEqual(history.History.OrderBy(e => e.Timestamp).ThenBy(e => e.Seq).ToList(), history.History.ToList());
        Assert.IsNull(ProductionEventProjections.History(Events(), "P-04", "9999/01"));
    }

    [TestMethod]
    public void Page_SortsAndCuts()
    {
        var items = Enumerable.Range(1, 10).ToList();
        var (page, total) = ProductionEventProjections.Page(items, i => i, new PagedRequest(2, 3, Sorting.Descending));

        Assert.AreEqual(10, total);
        CollectionAssert.AreEqual(SecondPageDescending, page);
    }
}
