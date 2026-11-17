// SPDX-License-Identifier: Apache-2.0
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
    [TestMethod]
    public void EveryJobOrderAndProgramExecutionEvent_BecomesAProductionEvent_AndNothingElse()
    {
        var run = MachineRun.For(TimeSpan.FromHours(6));
        var events = run.Messages.OfType<SpecEvent>().ToList();
        var production = events.Select(e => (Spec: e, Dto: ProductionEventMapper.From(e, "P-04"))).ToList();

        Assert.IsTrue(production.Where(p => p.Spec.Path.StartsWith("Production.", StringComparison.Ordinal)).All(p => p.Dto is not null));
        Assert.IsTrue(production.Where(p => p.Spec.Path.StartsWith("Notification.", StringComparison.Ordinal)).All(p => p.Dto is null),
            "alerts stay notification events");

        var dtos = production.Select(p => p.Dto).OfType<ProductionEventDtoV1>().ToList();
        Assert.IsTrue(dtos.Count > 200);
        Assert.AreEqual(dtos.Count, dtos.Select(d => d.Id).Distinct().Count(), "every event has an id of its own");
        CollectionAssert.AreEquivalent(Enum.GetValues<ProductionAction>().ToList(),
            dtos.Where(d => d.Subject == ProductionSubject.JobOrder).Select(d => d.Action).Distinct().ToList(), "every action of a job order occurs");
        CollectionAssert.AreEquivalent(
            new[] { ProductionAction.Started, ProductionAction.Interrupted, ProductionAction.Resumed, ProductionAction.Ended, ProductionAction.Aborted },
            dtos.Where(d => d.Subject == ProductionSubject.ProgramExecution).Select(d => d.Action).Distinct().ToList());
    }

    [TestMethod]
    public void ProgramExecutionEnded_CarriesItsSumsInJoule()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).First();
        var dto = ProductionEventMapper.From(ended, "P-04")!;

        Assert.AreEqual(ProductionSubject.ProgramExecution, dto.Subject);
        Assert.AreEqual(ProductionAction.Ended, dto.Action);
        Assert.AreEqual(ended.Value["ExecutionId"]!.GetValue<string>(), dto.CorrelationId);
        Assert.AreEqual(dto.ExecutionId, dto.CorrelationId);
        Assert.AreEqual(ended.Value["JobOrderID"]!.GetValue<string>(), dto.JobOrderId);
        Assert.AreEqual(ended.Value["ActiveWorkMaster"]!.GetValue<string>(), dto.WorkMaster);
        Assert.AreEqual("Ended", dto.State);
        Assert.AreEqual(ended.Value["EnergyElectricity"]!.GetValue<double>() * 3600, dto.EnergyElectricity!.Value, 1e-6, "watt hours become joule");
        Assert.AreEqual(ended.Value["Duration"]!.GetValue<double>(), dto.Duration);
        Assert.AreEqual(1, dto.PartsProduced);
        Assert.IsNull(dto.EnergyCompressedAir, "the machine has no compressed air");
        Assert.AreEqual(ended.Timestamp.UtcDateTime, dto.Timestamp);
        Assert.AreEqual(ended.Id, dto.Id, "the id of the CloudEvent of the spec output");
        Assert.AreEqual(ended.Seq, dto.Seq);

        var started = ProductionEventMapper.From(run.EventsOf(SpecElements.ProgramExecutionStarted).First(), "P-04")!;
        Assert.IsNull(started.Duration, "sums only at the end");
        Assert.IsNotNull(started.StartTime);
    }

    [TestMethod]
    public void JobOrderEvent_CarriesTheWholeStateOfTheJobOrder()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var ended = run.EventsOf(SpecElements.JobOrderEnded).First();
        var dto = ProductionEventMapper.From(ended, "P-04")!;

        Assert.AreEqual(ProductionSubject.JobOrder, dto.Subject);
        Assert.AreEqual(ProductionAction.Ended, dto.Action);
        Assert.AreEqual(dto.JobOrderId, dto.CorrelationId);
        Assert.IsNull(dto.ExecutionId);
        Assert.AreEqual("Ended", dto.State);
        Assert.IsNotNull(dto.StartTime);
        Assert.IsNotNull(dto.EndTime);
        Assert.AreEqual(ended.Value["ProducedQuantity"]!.GetValue<double>(), dto.ProducedQuantity);
        Assert.AreEqual(ended.Value["GoodQuantity"]!.GetValue<double>(), dto.GoodQuantity);
    }

    [TestMethod]
    public async Task Output_PublishesOnTheProductionTopic_WithQos1_NotRetained()
    {
        using var client = new FakeClient { IsConnected = true };
        var output = new ProductionEventOutput(client, "P-04");
        var run = MachineRun.For(TimeSpan.FromHours(1));

        await output.PublishAsync(run.Messages);

        var expected = run.Messages.OfType<SpecEvent>().Count(e => e.Path.StartsWith("Production.", StringComparison.Ordinal));
        Assert.HasCount(expected, client.Published);
        foreach (var message in client.Published)
        {
            Assert.AreEqual("machines/P-04/events/production", message.Topic);
            Assert.AreEqual("productioneventdtov1", message.ContentType);
            Assert.AreEqual(MqttQualityOfServiceLevel.AtLeastOnce, message.QualityOfServiceLevel);
            Assert.IsFalse(message.Retain);
        }

        // The payload reads back as the DTO, in the order the events came up.
        var dtos = client.Published
            .Select(m => JsonSerializer.Deserialize<ProductionEventDtoV1>(Encoding.UTF8.GetString(m.Payload), JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions)!)
            .ToList();
        Assert.IsTrue(dtos.All(d => d.MId == "P-04"));
        var seqs = dtos.Select(d => d.Seq!.Value).ToList();
        CollectionAssert.AreEqual(Enumerable.Range(1, seqs.Count).Select(i => (long)i).ToList(), seqs);
    }
}
