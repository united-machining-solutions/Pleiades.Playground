// SPDX-License-Identifier: Apache-2.0
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
    private const string MachineId = "example-com_P-04";
    private const string Epoch = "2026-11-17T06:00:00.000Z";

    [TestMethod]
    public async Task Events_GoBelowEventsWithQos1AndNotRetained()
    {
        using var client = new FakeClient { IsConnected = true };
        using var publisher = Publisher(client, 10);

        await publisher.PublishAsync([Value(1), Event(1), Event(2)]);

        var events = client.Published.Where(m => m.Topic.Contains("/events/", StringComparison.Ordinal)).ToList();
        Assert.HasCount(2, events);
        Assert.IsTrue(events.All(m => m.Topic == $"umati/{MachineId}/events/production"));
        Assert.IsTrue(events.All(m => !m.Retain && m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce));
        Assert.IsTrue(events.All(m => m.ContentType == SpecWire.ContentType));
        CollectionAssert.AreEqual(new long[] { 1, 2 }, events.Select(Seq).ToList());

        var value = client.Published.Single(m => m.Topic.EndsWith("/State/FeedOverride", StringComparison.Ordinal));
        Assert.IsTrue(value.Retain);
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
        CollectionAssert.AreEquivalent(new[] { $"umati/{MachineId}/events/production", $"umati/{MachineId}/events/notifications" }, topics,
            "one topic per group, none per event");
        foreach (var (group, name) in new[] { ("Production", "production"), ("Notification", "notifications") })
        {
            var onTopic = client.Published.Where(m => m.Topic == $"umati/{MachineId}/events/{name}").Select(Payload).ToList();
            var expected = events.Where(e => e.Path.StartsWith(group + ".", StringComparison.Ordinal)).ToList();
            CollectionAssert.AreEqual(expected.Select(e => e.Path).ToList(), onTopic.Select(p => p["event"]!.GetValue<string>()).ToList(),
                $"the events of {group} in the order they came up");
            var seqs = onTopic.Select(p => p["seq"]!.GetValue<long>()).ToList();
            Assert.IsTrue(seqs.Zip(seqs.Skip(1)).All(p => p.Second > p.First), $"seq grows on {group}");
        }

        // Job order and program execution share the topic: a job order starts before its first program execution.
        var production = client.Published.Where(m => m.Topic.EndsWith("/events/production", StringComparison.Ordinal))
            .Select(m => Payload(m)["event"]!.GetValue<string>()).ToList();
        Assert.IsTrue(production.IndexOf(SpecElements.JobOrderStarted) < production.IndexOf(SpecElements.ProgramExecutionStarted));
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
        Assert.AreEqual($"umati/{MachineId}/Connection/State", topics[0]);
        Assert.AreEqual($"umati/{MachineId}/Manifest", topics[1]);
        Assert.AreEqual($"umati/{MachineId}/Connection/State", topics[3]);
        Assert.AreEqual("Connected", Payload(client.Published[3])["value"]!.GetValue<string>());

        var events = client.Published.Skip(4).ToList();
        CollectionAssert.AreEqual(new long[] { 1, 2, 3 }, events.Select(Seq).ToList(), "in their order, after Connected");
        Assert.AreEqual(SpecWire.Timestamp(MachineRun.Start.AddSeconds(1)), Payload(events[0])["timestamp"]!.GetValue<string>(), "with their source time");
        Assert.AreEqual(0, publisher.Buffered);
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

    private static SpecPublisher Publisher(FakeClient client, int capacity)
    {
        return new SpecPublisher(client, MachineId, new JsonObject { ["modelVersion"] = "0.13.1" }, Epoch, capacity, NullLogger.Instance);
    }

    private static SpecValue Value(int second)
    {
        return new SpecValue(SpecElements.FeedOverride, JsonValue.Create(0.9), "one", MachineRun.Start.AddSeconds(second), null);
    }

    private static SpecEvent Event(long seq)
    {
        return new SpecEvent(SpecElements.JobOrderChanged, MachineRun.Start.AddSeconds(seq), seq,
            new JsonObject { ["JobOrderID"] = "4711/01", ["State"] = "AllowedToStart" });
    }

    private static JsonObject Payload(MqttApplicationMessage message)
    {
        return JsonNode.Parse(Encoding.UTF8.GetString(message.Payload))!.AsObject();
    }

    private static long Seq(MqttApplicationMessage message)
    {
        var payload = Payload(message);
        Assert.AreEqual(Epoch, payload["seqEpoch"]!.GetValue<string>());
        return payload["seq"]!.GetValue<long>();
    }

#pragma warning disable CS0067 // The events of the interface are not raised by this fake.
    private sealed class FakeClient : IManagedMqttClient
    {
        public List<MqttApplicationMessage> Published { get; } = [];

        public IMqttClient InternalClient => throw new NotSupportedException();

        public bool IsConnected { get; set; }

        public bool IsStarted => true;

        public int PendingApplicationMessagesCount => 0;

        public event Func<MqttApplicationMessageReceivedEventArgs, Task>? ApplicationMessageReceivedAsync;

        public event Func<MqttClientConnectedEventArgs, Task>? ConnectedAsync;

        public event Func<MqttClientDisconnectedEventArgs, Task>? DisconnectedAsync;

        public event Func<ConnectingFailedEventArgs, Task>? ConnectingFailedAsync;

        public event Func<ApplicationMessageSkippedEventArgs, Task>? ApplicationMessageSkippedAsync;

        public event Func<SubscriptionsChangedEventArgs, Task>? SubscriptionsChangedAsync;

        public Task EnqueueAsync(MqttApplicationMessage applicationMessage)
        {
            Published.Add(applicationMessage);
            return Task.CompletedTask;
        }

        public Task StartAsync(ManagedMqttClientOptions options) => Task.CompletedTask;

        public Task StopAsync(bool cleanDisconnect = true) => Task.CompletedTask;

        public Task SubscribeAsync(IEnumerable<MqttTopicFilter> topicFilters) => Task.CompletedTask;

        public Task UnsubscribeAsync(IEnumerable<string> topics) => Task.CompletedTask;

        public void Dispose()
        {
        }
    }
#pragma warning restore CS0067
}
