// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>One job across machines: its steps, the waiting between them and where it stands.</summary>
[TestClass]
public sealed class JobViewTest
{
    private static readonly DateTime Start = MachineEventSamples.Start;
    private static readonly string[] MillGrinderMeasuring = [JobSamples.Mill, JobSamples.Grinder, JobSamples.Measuring];
    private static readonly string[] OneOrderNumber = ["SO-100"];

    [TestMethod]
    public void Job_HasOneStepPerMachine_ByStartThenPlannedStart()
    {
        var events = JobSamples.Events();

        var job = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!;

        CollectionAssert.AreEqual(MillGrinderMeasuring, job.Steps.Select(s => s.MId).ToList());
        CollectionAssert.AreEqual(OneOrderNumber, job.OrderNumbers.ToList());
        Assert.AreEqual(Start.AddMinutes(10), job.StartTime);
        Assert.IsNull(job.EndTime, "the job has a step to go");
    }

    [TestMethod]
    public void Job_StepHasItsResult_AndTheSumsOfItsProgramExecutions()
    {
        var events = JobSamples.Events();

        var mill = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!.Steps[0];

        Assert.AreEqual("Ended", mill.State);
        Assert.AreEqual(Start.AddMinutes(10), mill.StartTime);
        Assert.AreEqual(Start.AddMinutes(20), mill.EndTime);
        Assert.AreEqual(600, mill.DurationSeconds);
        Assert.AreEqual(2, mill.ProducedQuantity);
        Assert.AreEqual("Successful", mill.JobResult);
        Assert.AreEqual(2, mill.ProgramExecutions);
        Assert.AreEqual(240, mill.ProgramExecutionDuration);
        Assert.AreEqual(2, mill.PartsProduced);
        Assert.AreEqual(150.25, mill.EnergyElectricity);
        Assert.AreEqual(3, mill.EnergyCompressedAir);
        Assert.IsNull(mill.WaitingSecondsBefore, "the first step waits for nothing");
    }

    [TestMethod]
    public void Job_WaitingIsFromTheEndOfTheStepBeforeToTheStart_NullIfUnknown()
    {
        var events = JobSamples.Events();

        var steps = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!.Steps;

        Assert.AreEqual(600, steps[1].WaitingSecondsBefore, "the mill ended at minute 20, the grinder started at 30");
        Assert.IsNull(steps[2].WaitingSecondsBefore, "the measuring machine has not started");
    }

    [TestMethod]
    public void Job_StepsThatOverlap_WaitANegativeTime()
    {
        // The mill ends at minute 35 instead of 20, five minutes after the grinder started.
        var events = JobSamples.Events().Where(e => !(e.MId == JobSamples.Mill && e.Time >= Start.AddMinutes(20))).ToList();
        events.AddRange(MachineEventMapper.ToDtos(
        [
            MachineEventMapper.ToDao(JobSamples.Mill, MachineEventSamples.CloudEvent(
                "JobMonitoring.JobOrderResultChanged", 35, 6, new JsonObject
                {
                    ["JobOrderID"] = JobSamples.JobOrderId,
                    ["StartTime"] = "2026-11-17T06:10:00Z",
                    ["EndTime"] = "2026-11-17T06:35:00Z",
                    ["ProducedQuantity"] = 2,
                    ["JobResult"] = "Successful",
                }), Start),
            MachineEventMapper.ToDao(JobSamples.Mill, MachineEventSamples.CloudEvent(
                "JobMonitoring.JobOrderEnded", 35, 5, new JsonObject
                {
                    ["JobOrderID"] = JobSamples.JobOrderId,
                    ["State"] = "Ended",
                }), Start),
        ]));

        var steps = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!.Steps;

        Assert.AreEqual(JobSamples.Grinder, steps[1].MId);
        Assert.AreEqual(-300, steps[1].WaitingSecondsBefore, "the grinder started five minutes before the mill ended");
    }

    [TestMethod]
    public void Job_AnIdUsedBeforeOnAMachine_CountsOnlyItsLastLife()
    {
        var events = JobSamples.Events();

        var measuring = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!.Steps[2];

        Assert.AreEqual("AllowedToStart", measuring.State);
        Assert.AreEqual(Start.AddMinutes(7), measuring.FirstSeen, "the life after the job order was removed");
        Assert.IsFalse(measuring.Removed);
        Assert.IsNull(measuring.StartTime, "the start of the earlier life is not this one's");
        Assert.IsNull(measuring.JobResult);
        Assert.AreEqual(0, measuring.ProgramExecutions, "the program execution of the earlier life is not this one's");
        Assert.AreEqual(0, measuring.EnergyElectricity);
        Assert.AreEqual(Start.AddMinutes(45), measuring.PlannedStartTime);
    }

    [TestMethod]
    public void Job_BetweenTwoSteps_StandsAtTheNextOne_SinceTheEndOfTheOneBefore()
    {
        var events = JobSamples.Events();

        var position = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!.Position;

        Assert.AreEqual("Between", position.State);
        Assert.AreEqual(2, position.StepIndex);
        Assert.AreEqual(JobSamples.Measuring, position.MId);
        Assert.AreEqual(Start.AddMinutes(40), position.Since);
    }

    [TestMethod]
    public void Job_Running_StandsAtTheMachineThatRunsIt_AndCountsFromItsStart()
    {
        var events = JobSamples.WithMeasuringRunning();

        var job = MachineEventViews.Job(events, events, JobSamples.JobOrderId)!;

        Assert.AreEqual("Running", job.Position.State);
        Assert.AreEqual(JobSamples.Measuring, job.Position.MId);
        Assert.AreEqual(Start.AddMinutes(46), job.Position.Since);
        Assert.AreEqual(360, job.Steps[2].WaitingSecondsBefore);
        Assert.AreEqual(1, job.Steps[2].ProgramExecutions, "the one that runs, not the one of the earlier life");
        Assert.AreEqual(0, job.Steps[2].EnergyElectricity, "a program execution that runs has no sums yet");
        Assert.AreEqual(230.25, job.EnergyElectricity, "the sums of every step, the earlier life left out");
    }

    [TestMethod]
    public void Job_BeforeItsFirstStart_Waits_AndAfterItsLastEnd_IsEnded()
    {
        var events = JobSamples.Events();
        var onlyAdded = events.Where(e => e.MId == JobSamples.Mill && e.Time < Start.AddMinutes(10)).ToList();
        var millOnly = events.Where(e => e.MId == JobSamples.Mill).ToList();

        var waiting = MachineEventViews.Job(onlyAdded, onlyAdded, JobSamples.JobOrderId)!;
        var ended = MachineEventViews.Job(millOnly, millOnly, JobSamples.JobOrderId)!;

        Assert.AreEqual("Waiting", waiting.Position.State);
        Assert.AreEqual(0, waiting.Position.StepIndex);
        Assert.IsNull(waiting.Position.Since);
        Assert.AreEqual("Ended", ended.Position.State);
        Assert.AreEqual(Start.AddMinutes(20), ended.EndTime);
    }

    [TestMethod]
    public void Job_ThatNoEventNames_IsNull()
    {
        var events = JobSamples.Events();

        Assert.IsNull(MachineEventViews.Job(events, events, "unknown/01"));
    }

    [TestMethod]
    public void LastLife_BeginsWithAddedOrAfterRemoved()
    {
        var measuring = JobSamples.Events().Where(e => e.MId == JobSamples.Measuring && e.Group == "JobMonitoring").ToList();

        var life = MachineEventViews.LastLife(measuring);

        Assert.HasCount(2, life);
        Assert.AreEqual("JobMonitoring.JobOrderAdded", life[0].Type);
    }
}
