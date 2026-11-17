// SPDX-License-Identifier: Apache-2.0
using System.Buffers;
using System.Text;
using System.Text.Json;
using MQTTnet.Protocol;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Simulator.Production;
using Pleiades.Playground.Simulator.Spec;
using Pleiades.Playground.Simulator.Test.Spec;

namespace Pleiades.Playground.Simulator.Test.Production;

[TestClass]
public sealed class ProductionEventTest
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    [TestMethod]
    public void EveryJobOrderEvent_BecomesAJobEvent_EveryProgramExecutionEvent_AWorkMasterEvent()
    {
        var run = MachineRun.For(TimeSpan.FromHours(6));
        var events = run.Messages.OfType<SpecEvent>().ToList();

        var jobs = events.Select(e => ProductionEventMapper.ToJobEvent(e, "P-04")).OfType<JobEventDtoV1>().ToList();
        var workMasters = events.Select(e => ProductionEventMapper.ToWorkMasterEvent(e, "P-04")).OfType<WorkMasterEventDtoV1>().ToList();

        Assert.HasCount(events.Count(e => e.Path.StartsWith("JobMonitoring.", StringComparison.Ordinal)), jobs);
        Assert.HasCount(events.Count(e => e.Path.StartsWith("WorkMasterMonitoring.", StringComparison.Ordinal)), workMasters);
        Assert.IsTrue(events.Where(e => e.Path.StartsWith("Notification.", StringComparison.Ordinal))
            .All(e => ProductionEventMapper.ToJobEvent(e, "P-04") is null && ProductionEventMapper.ToWorkMasterEvent(e, "P-04") is null),
            "alerts stay notification events");

        Assert.IsTrue(jobs.Count > 200);
        var ids = jobs.Select(d => d.Id).Concat(workMasters.Select(d => d.Id)).ToList();
        Assert.AreEqual(ids.Count, ids.Distinct().Count(), "every event has an id of its own");
        CollectionAssert.AreEquivalent(Enum.GetValues<JobAction>().ToList(), jobs.Select(d => d.Action).Distinct().ToList(), "every action of a job order occurs");
        CollectionAssert.AreEquivalent(Enum.GetValues<WorkMasterAction>().ToList(), workMasters.Select(d => d.Action).Distinct().ToList());
    }

    [TestMethod]
    public void ProgramExecutionEnded_CarriesItsSumsInJoule()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).First();
        var dto = ProductionEventMapper.ToWorkMasterEvent(ended, "P-04")!;

        Assert.AreEqual(WorkMasterAction.Ended, dto.Action);
        Assert.AreEqual(ended.Value["ExecutionId"]!.GetValue<string>(), dto.CorrelationId);
        Assert.AreEqual(dto.ExecutionId, dto.CorrelationId);
        Assert.AreEqual(ended.Value["JobOrderID"]!.GetValue<string>(), dto.JobOrderId);
        Assert.AreEqual(ended.Value["ActiveWorkMaster"]!.GetValue<string>(), dto.WorkMasterId);
        Assert.AreEqual("Ended", dto.State);
        Assert.AreEqual(ended.Value["EnergyElectricity"]!.GetValue<double>() * 3600, dto.EnergyElectricity!.Value, 1e-6, "watt hours become joule");
        Assert.AreEqual(ended.Value["Duration"]!.GetValue<double>(), dto.Duration);
        Assert.AreEqual(1, dto.PartsProduced);
        Assert.IsNull(dto.EnergyCompressedAir, "the machine has no compressed air");
        Assert.AreEqual(ended.Timestamp.UtcDateTime, dto.Timestamp);
        Assert.AreEqual(ended.Id, dto.Id, "the id of the CloudEvent of the spec output");

        var started = ProductionEventMapper.ToWorkMasterEvent(run.EventsOf(SpecElements.ProgramExecutionStarted).First(), "P-04")!;
        Assert.IsNull(started.Duration, "sums only at the end");
        Assert.AreEqual(started.Timestamp, started.StartTime);
    }

    [TestMethod]
    public void JobEvent_CarriesTheJobOrderAndItsResult()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var ended = run.EventsOf(SpecElements.JobOrderEnded).First();
        var dto = ProductionEventMapper.ToJobEvent(ended, "P-04")!;

        Assert.AreEqual(JobAction.Ended, dto.Action);
        Assert.AreEqual(dto.JobOrderId, dto.CorrelationId);
        Assert.AreEqual("Ended", dto.State);
        Assert.AreEqual(ended.Value["WorkMasterID"]!.GetValue<string>(), dto.WorkMasterId);
        Assert.AreEqual(ended.Value["RunsPlanned"]!.GetValue<long>(), dto.RunsPlanned);
        CollectionAssert.AreEqual(new[] { ended.Value["OrderNumbers"]![0]!.GetValue<string>() }, dto.OrderNumbers!.ToList());
        Assert.AreEqual("ProductionMode", dto.JobExecutionMode);
        Assert.IsNull(dto.PlannedStartTime, "the machine knows no plan");
        // The model keeps the result apart; the job event carries the job order and its result in one.
        Assert.IsFalse(ended.Value.ContainsKey("ProducedQuantity"));
        Assert.AreEqual(ended.Related!["ProducedQuantity"]!.GetValue<double>(), dto.ProducedQuantity);
        Assert.AreEqual(ended.Related["RunsCompleted"]!.GetValue<long>(), dto.RunsCompleted);
        Assert.IsNotNull(dto.StartTime);
        Assert.IsNotNull(dto.EndTime);
        Assert.AreEqual("Successful", dto.JobResult);
    }

    [TestMethod]
    public void ResultChanged_CarriesTheNewResult_WithTheStateOfTheJobOrder_AndNoResultBeforeTheStart()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var changed = run.EventsOf(SpecElements.JobOrderResultChanged).First();
        var dto = ProductionEventMapper.ToJobEvent(changed, "P-04")!;

        Assert.AreEqual(JobAction.ResultChanged, dto.Action);
        Assert.AreEqual(changed.Related!["State"]!.GetValue<string>(), dto.State);
        Assert.AreEqual(changed.Value["ProducedQuantity"]!.GetValue<double>(), dto.ProducedQuantity);
        Assert.IsNull(dto.EndTime, "EndTime is null until the end");
        Assert.AreEqual("Unknown", dto.JobResult);

        var added = ProductionEventMapper.ToJobEvent(run.EventsOf(SpecElements.JobOrderAdded).First(), "P-04")!;
        var cancelled = ProductionEventMapper.ToJobEvent(run.EventsOf(SpecElements.JobOrderCancelled).First(), "P-04")!;
        foreach (var notStarted in new[] { added, cancelled })
        {
            Assert.IsNull(notStarted.StartTime);
            Assert.IsNull(notStarted.ProducedQuantity);
            Assert.IsNull(notStarted.RunsCompleted);
            Assert.IsNull(notStarted.JobResult, "no result before the start");
            Assert.IsNotNull(notStarted.WorkMasterId, "what is ordered is there from the start");
        }
    }

    [TestMethod]
    public async Task Output_PublishesBothTypesOnTheirTopics_WithQos1_NotRetained_EachCountingOnItsOwn()
    {
        using var client = new FakeClient { IsConnected = true };
        var output = new ProductionEventOutput(client, "P-04");
        var run = MachineRun.For(TimeSpan.FromHours(1));

        await output.PublishAsync(run.Messages);

        var events = run.Messages.OfType<SpecEvent>().ToList();
        var jobs = client.Published.Where(m => m.Topic == "machines/P-04/events/jobs").ToList();
        var workMasters = client.Published.Where(m => m.Topic == "machines/P-04/events/workmasters").ToList();
        Assert.HasCount(jobs.Count + workMasters.Count, client.Published, "no other topic");
        Assert.HasCount(events.Count(e => e.Path.StartsWith("JobMonitoring.", StringComparison.Ordinal)), jobs);
        Assert.HasCount(events.Count(e => e.Path.StartsWith("WorkMasterMonitoring.", StringComparison.Ordinal)), workMasters);
        Assert.IsTrue(jobs.All(m => m.ContentType == "jobeventdtov1"));
        Assert.IsTrue(workMasters.All(m => m.ContentType == "workmastereventdtov1"));
        Assert.IsTrue(client.Published.All(m => m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce && !m.Retain));

        // The payloads read back as the DTOs, each type numbered without a gap, in the order the events came up.
        var jobSeqs = jobs.Select(m => Read<JobEventDtoV1>(m.Payload).Seq!.Value).ToList();
        var workMasterSeqs = workMasters.Select(m => Read<WorkMasterEventDtoV1>(m.Payload).Seq!.Value).ToList();
        CollectionAssert.AreEqual(Enumerable.Range(1, jobSeqs.Count).Select(i => (long)i).ToList(), jobSeqs);
        CollectionAssert.AreEqual(Enumerable.Range(1, workMasterSeqs.Count).Select(i => (long)i).ToList(), workMasterSeqs);
    }

    private static T Read<T>(ReadOnlySequence<byte> payload)
    {
        return JsonSerializer.Deserialize<T>(Encoding.UTF8.GetString(payload), Json)!;
    }
}
