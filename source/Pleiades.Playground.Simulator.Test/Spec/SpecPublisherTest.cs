// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using MQTTnet;
using MQTTnet.Packets;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

[TestClass]
public sealed class SpecPublisherTest
{
    private const string SerialNumber = "P-04";
    private const string Prefix = "20261117T060000Z";
    private const string Source = "https://www.alcyone-machines.example/GM-500/P-04";

    [TestMethod]
    public async Task Events_GoBelowEventsWithQos1AndNotRetained()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);

        await publisher.PublishAsync([Value(1), Event(1), Event(2)]);

        var events = client.Published.Where(m => m.Topic.Contains("/events/", StringComparison.Ordinal)).ToList();
        Assert.HasCount(2, events);
        Assert.IsTrue(events.All(m => m.Topic == $"machines/{SerialNumber}/events/jobs"));
        Assert.IsTrue(events.All(m => !m.Retain && m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce));
        Assert.IsTrue(events.All(m => m.ContentType == "application/cloudevents+json; charset=utf-8"));
        CollectionAssert.AreEqual(new long[] { 1, 2 }, events.Select(Seq).ToList());

        var value = client.Published.Single(m => m.Topic.EndsWith("/State/FeedOverride", StringComparison.Ordinal));
        Assert.IsTrue(value.Retain);
        Assert.AreEqual("application/json", value.ContentType);
    }

    [TestMethod]
    public async Task EveryEventOfAGroup_GoesToOneTopic_InTheOrderItCameUp()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var events = run.Messages.OfType<SpecEvent>().ToList();

        await publisher.PublishAsync(events);

        var topics = client.Published.Select(m => m.Topic).Distinct().ToList();
        CollectionAssert.AreEquivalent(
            new[] { $"machines/{SerialNumber}/events/jobs", $"machines/{SerialNumber}/events/workmasters", $"machines/{SerialNumber}/events/notifications" },
            topics, "one topic per group, none per event");
        foreach (var (group, name) in new[] { ("JobMonitoring", "jobs"), ("WorkMasterMonitoring", "workmasters"), ("Notification", "notifications") })
        {
            var onTopic = client.Published.Where(m => m.Topic == $"machines/{SerialNumber}/events/{name}").Select(Payload).ToList();
            var expected = events.Where(e => e.Path.StartsWith(group + ".", StringComparison.Ordinal)).ToList();
            CollectionAssert.AreEqual(expected.Select(e => e.Path).ToList(), onTopic.Select(p => p["type"]!.GetValue<string>()).ToList(),
                $"the events of {group} in the order they came up");
            var sequences = onTopic.Select(p => p["sequence"]!.GetValue<string>()).ToList();
            Assert.IsTrue(sequences.Zip(sequences.Skip(1)).All(p => string.CompareOrdinal(p.Second, p.First) > 0), $"sequence grows on {group}, as a string");
            CollectionAssert.AreEqual(expected.Select(e => e.Id).ToList(), onTopic.Select(p => p["id"]!.GetValue<string>()).ToList());
        }

        // Job order and program execution lie on two topics now: across them only the time orders them.
        var payloads = client.Published.Select(Payload).ToList();
        var jobStarted = payloads.First(p => p["type"]!.GetValue<string>() == SpecElements.JobOrderStarted)["time"]!.GetValue<string>();
        var executionStarted = payloads.First(p => p["type"]!.GetValue<string>() == SpecElements.ProgramExecutionStarted)["time"]!.GetValue<string>();
        Assert.IsTrue(string.CompareOrdinal(jobStarted, executionStarted) <= 0, "a job order starts before its first program execution");
    }

    [TestMethod]
    public async Task WithoutBroker_EventsWaitAndFollowTheStateAfterTheConnect()
    {
        using var client = new FakeClient { IsConnected = false };
        using var publisher = Publisher(client, 10);

        await publisher.PublishAsync([Value(1), Event(1), Event(2)]);
        await publisher.PublishAsync([Event(3)]);
        Assert.IsEmpty(client.Published, "nothing goes out without a connection");
        Assert.AreEqual(3, publisher.Buffered);

        client.IsConnected = true;
        await publisher.PublishStateAsync([new SpecValue(SpecElements.FeedOverride, JsonValue.Create(1.0), "one", MachineRun.Start, null)], MachineRun.Start);

        var topics = client.Published.Select(m => m.Topic).ToList();
        Assert.AreEqual($"machines/{SerialNumber}/umati/Connection/State", topics[0]);
        Assert.AreEqual("Initializing", Payload(client.Published[0])["value"]!.GetValue<string>());
        Assert.AreEqual($"machines/{SerialNumber}/umati/Manifest", topics[1]);
        Assert.AreEqual($"machines/{SerialNumber}/umati/Connection/State", topics[3]);
        Assert.AreEqual("Running", Payload(client.Published[3])["value"]!.GetValue<string>());
        Assert.IsGreaterThan(DateTimeOffset.Parse(Payload(client.Published[0])["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture),
            DateTimeOffset.Parse(Payload(client.Published[3])["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture),
            "Running after Initializing, so the newest value is the state at the end");

        var events = client.Published.Skip(4).ToList();
        CollectionAssert.AreEqual(new long[] { 1, 2, 3 }, events.Select(Seq).ToList(), "in their order, after Running");
        Assert.AreEqual(SpecWire.Timestamp(MachineRun.Start.AddSeconds(1)), Payload(events[0])["time"]!.GetValue<string>(), "with their source time");
        Assert.AreEqual(Event(1).Id, Payload(events[0])["id"]!.GetValue<string>(), "with the id they had when they came up");
        Assert.AreEqual(0, publisher.Buffered);
    }

    [TestMethod]
    public async Task TheStepThatEndsAFault_SendsTheStateFirst_ThenItsEvents()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);
        await publisher.PublishStateAsync([], MachineRun.Start);
        client.Published.Clear();

        await VirtualMachineService.PublishStepAsync(publisher, changed: true, faulted: false, [Value(2), Event(7), Event(8)],
            [new SpecValue(SpecElements.FeedOverride, JsonValue.Create(1.0), "one", MachineRun.Start, null)], MachineRun.Start.AddMinutes(1));

        var topics = client.Published.Select(m => m.Topic).ToList();
        var running = topics.IndexOf($"machines/{SerialNumber}/umati/Connection/State");
        Assert.IsGreaterThanOrEqualTo(0, running, "the adapter says Running");
        Assert.AreEqual("Running", Payload(client.Published[running])["value"]!.GetValue<string>());
        var events = client.Published.Select((m, i) => (m, i)).Where(p => p.m.Topic.Contains("/events/", StringComparison.Ordinal)).ToList();
        CollectionAssert.AreEqual(new long[] { 7, 8 }, events.Select(p => Seq(p.m)).ToList(), "the events of that step are not lost");
        Assert.IsTrue(events.All(p => p.i > running), "after Running");
    }

    [TestMethod]
    public async Task TheEventsOfTheStart_GoOutAfterTheFirstConnect_SoARunBeginsWithCount1()
    {
        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", Source);
        var machine = new VirtualMachine(identity, MachineRun.Config(), new MachineCounters(1000, 5000, 100), MachineRun.Start);
        var initial = machine.TakeInitialMessages();
        Assert.IsTrue(initial.OfType<SpecEvent>().Any(), "the machine begins with job orders");
        using var client = new FakeClient { IsConnected = false };
        using var publisher = Publisher(client, 10);

        await publisher.PublishAsync([.. initial.OfType<SpecEvent>()]);
        Assert.IsEmpty(client.Published, "nothing goes out before the connect");
        client.IsConnected = true;
        await publisher.PublishStateAsync(machine.Values, MachineRun.Start);

        var topics = client.Published.Select(m => m.Topic).ToList();
        var running = topics.LastIndexOf($"machines/{SerialNumber}/umati/Connection/State");
        var events = client.Published.Select((m, i) => (m, i)).Where(p => p.m.Topic.EndsWith("/events/jobs", StringComparison.Ordinal)).ToList();
        CollectionAssert.AreEqual(
            Enumerable.Range(1, events.Count).Select(i => (long)i).ToList(),
            events.Select(p => long.Parse(Payload(p.m)["sequence"]!.GetValue<string>().Split('.')[1], System.Globalization.CultureInfo.InvariantCulture)).ToList(),
            "the job orders of the start, from 1 and without a gap");
        Assert.IsTrue(events.All(p => p.i > running), "after Running");
    }

    [TestMethod]
    public async Task TheStepThatEndsAFault_WithoutBroker_KeepsItsEventsInTheOutbox()
    {
        using var client = new FakeClient { IsConnected = false };
        using var publisher = Publisher(client, 10);

        await VirtualMachineService.PublishStepAsync(publisher, changed: true, faulted: false, [Value(2), Event(7)], [], MachineRun.Start);

        Assert.IsEmpty(client.Published);
        Assert.AreEqual(1, publisher.Buffered);
    }

    [TestMethod]
    public async Task FullOutbox_DropsTheOldestAndKeepsTheGapInSeq()
    {
        using var client = new FakeClient { IsConnected = false };
        using var publisher = Publisher(client, 3);

        await publisher.PublishAsync([.. Enumerable.Range(1, 5).Select(i => (SpecMessage)Event(i))]);
        Assert.AreEqual(3, publisher.Buffered);
        Assert.AreEqual(2, publisher.Dropped);

        client.IsConnected = true;
        await publisher.PublishStateAsync([], MachineRun.Start);
        await publisher.PublishAsync([Event(6)]);

        var seqs = client.Published.Where(m => m.Topic.Contains("/events/", StringComparison.Ordinal)).Select(Seq).ToList();
        CollectionAssert.AreEqual(new long[] { 3, 4, 5, 6 }, seqs, "1 and 2 are gone, nothing is renumbered");
    }

    [TestMethod]
    public async Task ConnectionState_InitializingThenRunning_OnlyAtTheFirstConnect()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);
        var value = new SpecValue(SpecElements.FeedOverride, JsonValue.Create(1.0), "one", MachineRun.Start, null);

        await publisher.PublishStateAsync([value], MachineRun.Start);
        Assert.AreEqual("Initializing Manifest FeedOverride Running", Trace(client), "after the start: Initializing, every value, Running");

        client.Published.Clear();
        await publisher.PublishStateAsync([value], MachineRun.Start.AddMinutes(5));
        Assert.AreEqual("Manifest FeedOverride Running", Trace(client), "a reconnect to the broker does not start the adapter again");

        client.Published.Clear();
        await publisher.PublishConnectionStateAsync(SpecPublisher.CommunicationFault, MachineRun.Start.AddMinutes(6));
        await publisher.PublishStateAsync([value], MachineRun.Start.AddMinutes(7));
        await publisher.PublishConnectionStateAsync(SpecPublisher.Shutdown, MachineRun.Start.AddMinutes(8));
        Assert.AreEqual("CommunicationFault Manifest FeedOverride Running Shutdown", Trace(client),
            "the machine lost and found again: every value anew, then Running; Shutdown at a clean stop");
    }

    [TestMethod]
    public async Task ConnectionState_AtAConnectWhileTheMachineIsLost_IsCommunicationFault()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);

        await publisher.PublishStateAsync([], MachineRun.Start, reachable: false);

        Assert.AreEqual("Initializing Manifest CommunicationFault", Trace(client));
    }

    [TestMethod]
    public async Task ConnectionState_WithoutBroker_GoesNowhere()
    {
        using var client = new FakeClient { IsConnected = false };
        using var publisher = Publisher(client, 10);

        await publisher.PublishConnectionStateAsync(SpecPublisher.CommunicationFault, MachineRun.Start);

        Assert.IsEmpty(client.Published, "the next connect publishes the state");
    }

    [TestMethod]
    public void LastWill_IsCommunicationFault_RetainedOnConnectionState()
    {
        var (topic, payload) = SpecPublisher.LastWill(SerialNumber, MachineRun.Start);
        var will = JsonNode.Parse(Encoding.UTF8.GetString(payload))!.AsObject();

        Assert.AreEqual($"machines/{SerialNumber}/umati/Connection/State", topic);
        Assert.AreEqual("CommunicationFault", will["value"]!.GetValue<string>());
        Assert.AreEqual(SpecWire.Timestamp(MachineRun.Start), will["timestamp"]!.GetValue<string>());
    }

    private static SpecPublisher Publisher(FakeClient client, int capacity)
    {
        return new SpecPublisher(client, SerialNumber, new JsonObject { ["modelVersion"] = "0.16.0" }, Source, capacity, NullLogger.Instance);
    }

    private static SpecValue Value(int second)
    {
        return new SpecValue(SpecElements.FeedOverride, JsonValue.Create(0.9), "one", MachineRun.Start.AddSeconds(second), null);
    }

    private static SpecEvent Event(long seq)
    {
        var sequence = SpecWire.Sequence(Prefix, seq);
        return new SpecEvent(SpecElements.JobOrderChanged, MachineRun.Start.AddSeconds(seq), seq,
            new JsonObject { ["JobOrderID"] = "4711/01", ["State"] = "AllowedToStart" }, SpecWire.NameUuid($"{Source} Production {sequence}"), sequence);
    }

    private static JsonObject Payload(MqttApplicationMessage message)
    {
        return JsonNode.Parse(Encoding.UTF8.GetString(message.Payload))!.AsObject();
    }

    /// <summary>The count of an event, from its <c>sequence</c>; the prefix is the start of the run.</summary>
    private static long Seq(MqttApplicationMessage message)
    {
        var payload = Payload(message);
        Assert.AreEqual(Source, payload["source"]!.GetValue<string>());
        var sequence = payload["sequence"]!.GetValue<string>().Split('.');
        Assert.AreEqual(Prefix, sequence[0]);
        Assert.AreEqual(12, sequence[1].Length);
        return long.Parse(sequence[1], System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>What went out, in short: the value of each Connection/State, the last level of every other topic.</summary>
    private static string Trace(FakeClient client)
    {
        return string.Join(' ', client.Published.Select(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)
            ? Payload(m)["value"]!.GetValue<string>()
            : m.Topic[(m.Topic.LastIndexOf('/') + 1)..]));
    }
}
