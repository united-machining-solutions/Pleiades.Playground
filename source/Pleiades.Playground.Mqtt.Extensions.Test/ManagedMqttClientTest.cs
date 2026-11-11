using System.Collections.Concurrent;
using MQTTnet;
using MQTTnet.Diagnostics.Logger;
using MQTTnet.Exceptions;
using MQTTnet.Protocol;

namespace Pleiades.Playground.Mqtt.Extensions.Test;

/// <summary>
/// The managed client replaces the one MQTTnet 4 shipped, so these tests pin what the services rely
/// on: it reconnects, subscribes again on every connection and keeps outgoing messages meanwhile.
/// </summary>
[TestClass]
public sealed class ManagedMqttClientTest
{
    private const string Values = "machines/+/timeseries/#";
    private const string Status = "machines/+/status/#";

    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AfterStart_ItConnects_SendsWhatWasSubscribedBefore_AndRaisesTheSuback()
    {
        var broker = new FakeMqttClient();
        using var client = Managed(broker);
        var subacks = new ConcurrentQueue<SubscriptionsChangedEventArgs>();
        client.SubscriptionsChangedAsync += Record(subacks);

        await client.SubscribeAsync(Values);
        await client.SubscribeAsync(Status, MqttQualityOfServiceLevel.AtLeastOnce);
        Assert.IsEmpty(broker.Subscribes, "SubscribeAsync only queues: the client is not started");

        await client.StartAsync(Options());
        await UntilAsync(() => !subacks.IsEmpty, "the SUBACK is raised");

        Assert.IsTrue(client.IsStarted);
        Assert.IsTrue(client.IsConnected);
        var sent = broker.Subscribes.SelectMany(options => options.TopicFilters).ToList();
        CollectionAssert.AreEquivalent(new[] { Values, Status }, sent.Select(filter => filter.Topic).ToList());
        Assert.AreEqual(MqttQualityOfServiceLevel.AtLeastOnce, sent.Single(filter => filter.Topic == Status).QualityOfServiceLevel);
        var granted = subacks.SelectMany(suback => suback.SubscribeResult).SelectMany(result => result.Items).ToList();
        CollectionAssert.AreEquivalent(new[] { Values, Status }, granted.Select(item => item.TopicFilter.Topic).ToList());
    }

    [TestMethod]
    public async Task AfterALostConnection_ItReconnects_AndSubscribesAgain()
    {
        var broker = new FakeMqttClient();
        using var client = Managed(broker);
        var subacks = new ConcurrentQueue<SubscriptionsChangedEventArgs>();
        client.SubscriptionsChangedAsync += Record(subacks);
        await client.SubscribeAsync(Values);
        await client.StartAsync(Options());
        await UntilAsync(() => subacks.Count == 1, "the first SUBACK is raised");

        await broker.LoseConnectionAsync();
        await UntilAsync(() => subacks.Count == 2, "the subscription is sent again on the new connection");

        Assert.AreEqual(2, broker.ConnectAttempts);
        Assert.IsTrue(client.IsConnected);
        Assert.AreEqual(Values, broker.Subscribes.Last().TopicFilters.Single().Topic,
            "a SUBACK answers for the connection it came on, so the new one needs the filter again");
    }

    [TestMethod]
    public async Task AConnectThatThrows_RaisesConnectingFailed_AndIsRepeated()
    {
        var unreachable = new MqttCommunicationException("no route", null);
        var broker = new FakeMqttClient();
        broker.OnConnect = () => broker.ConnectAttempts < 3 ? throw unreachable : FakeMqttClient.Accepted();
        using var client = Managed(broker);
        var failures = new ConcurrentQueue<ConnectingFailedEventArgs>();
        client.ConnectingFailedAsync += Record(failures);

        await client.StartAsync(Options());
        await UntilAsync(() => client.IsConnected, "the third attempt connects");

        Assert.HasCount(2, failures);
        Assert.AreSame(unreachable, failures.First().Exception);
        Assert.IsNull(failures.First().ConnectResult, "no CONNACK arrived");
    }

    [TestMethod]
    public async Task AConnectTheBrokerRefuses_RaisesConnectingFailedWithItsCode_AndIsRepeated()
    {
        // MQTTnet 5 returns a refused CONNECT instead of throwing it. Taken for a connection, the
        // loop would stop trying and the service would sit there disconnected.
        var broker = new FakeMqttClient();
        broker.OnConnect = () => broker.ConnectAttempts < 2 ? FakeMqttClient.Refused() : FakeMqttClient.Accepted();
        using var client = Managed(broker);
        var failures = new ConcurrentQueue<ConnectingFailedEventArgs>();
        client.ConnectingFailedAsync += Record(failures);

        await client.StartAsync(Options());
        await UntilAsync(() => client.IsConnected, "the second attempt connects");

        var failure = failures.Single();
        Assert.AreEqual(MqttClientConnectResultCode.NotAuthorized, failure.ConnectResult?.ResultCode);
        Assert.Contains("NotAuthorized", failure.Exception.Message, "the reason reaches the log through the exception");
    }

    [TestMethod]
    public async Task AConnectTheBrokerNeverAnswers_EndsAfterTheTimeout_AndIsRepeated()
    {
        // MQTTnet applies the timeout of its options only to a call without a cancelable token, and
        // the loop passes one. Without a timeout of its own the first attempt would never end.
        var broker = new FakeMqttClient();
        broker.WhileConnecting = token =>
            broker.ConnectAttempts < 2 ? Task.Delay(Timeout.InfiniteTimeSpan, token) : Task.CompletedTask;
        using var client = Managed(broker);
        var failures = new ConcurrentQueue<ConnectingFailedEventArgs>();
        client.ConnectingFailedAsync += Record(failures);
        var options = Options();
        options.ClientOptions.Timeout = TimeSpan.FromMilliseconds(50);

        await client.StartAsync(options);
        await UntilAsync(() => client.IsConnected, "the second attempt connects");

        Assert.IsInstanceOfType<OperationCanceledException>(failures.Single().Exception);
    }

    [TestMethod]
    public async Task AHandlerThatThrows_DoesNotEndTheLoop()
    {
        var broker = new FakeMqttClient();
        broker.OnConnect = () => broker.ConnectAttempts < 2 ? FakeMqttClient.Refused() : FakeMqttClient.Accepted();
        using var client = Managed(broker);
        client.ConnectingFailedAsync += _ => throw new InvalidOperationException("a handler of the service");

        await client.StartAsync(Options());
        await UntilAsync(() => client.IsConnected, "the second attempt connects");

        Assert.AreEqual(2, broker.ConnectAttempts);
    }

    [TestMethod]
    public async Task MessagesQueuedWithoutAConnection_ArePublishedInOrderOnceThereIsOne()
    {
        var reachable = false;
        var broker = new FakeMqttClient();
        broker.OnConnect = () => Volatile.Read(ref reachable) ? FakeMqttClient.Accepted() : FakeMqttClient.Refused();
        using var client = Managed(broker);
        await client.StartAsync(Options());

        await client.EnqueueAsync(Message("a"));
        await client.EnqueueAsync(Message("b"));
        await client.EnqueueAsync(Message("c"));
        await UntilAsync(() => broker.ConnectAttempts >= 2, "the broker was tried");
        Assert.IsEmpty(broker.Published);
        Assert.AreEqual(3, client.PendingApplicationMessagesCount);

        Volatile.Write(ref reachable, true);
        await UntilAsync(() => broker.Published.Count == 3, "the queue is published");

        CollectionAssert.AreEqual(new[] { "a", "b", "c" }, broker.Published.Select(message => message.Topic).ToList());
        Assert.AreEqual(0, client.PendingApplicationMessagesCount);
    }

    [TestMethod]
    public async Task AFullQueue_DropsTheOldestMessage_AndRaisesSkipped()
    {
        var reachable = false;
        var broker = new FakeMqttClient();
        broker.OnConnect = () => Volatile.Read(ref reachable) ? FakeMqttClient.Accepted() : FakeMqttClient.Refused();
        using var client = Managed(broker);
        var skipped = new ConcurrentQueue<ApplicationMessageSkippedEventArgs>();
        client.ApplicationMessageSkippedAsync += Record(skipped);
        await client.StartAsync(Options(maxPendingMessages: 2));

        await client.EnqueueAsync(Message("a"));
        await client.EnqueueAsync(Message("b"));
        await client.EnqueueAsync(Message("c"));

        Assert.AreEqual("a", skipped.Single().ApplicationMessage.Topic);
        Assert.AreEqual(2, client.PendingApplicationMessagesCount);

        Volatile.Write(ref reachable, true);
        await UntilAsync(() => broker.Published.Count == 2, "what is left of the queue is published");

        CollectionAssert.AreEqual(new[] { "b", "c" }, broker.Published.Select(message => message.Topic).ToList());
    }

    [TestMethod]
    public async Task APublishThatFails_IsRepeatedFromQoS1_AndGoneAtQoS0()
    {
        var failed = new ConcurrentDictionary<string, bool>();
        var broker = new FakeMqttClient
        {
            // The first two messages fail once each.
            OnPublish = message =>
            {
                if (message.Topic != "after" && failed.TryAdd(message.Topic, true))
                {
                    throw new MqttCommunicationException("the socket closed", null);
                }
            },
        };
        using var client = Managed(broker);
        await client.StartAsync(Options());

        await client.EnqueueAsync(Message("at-most-once", MqttQualityOfServiceLevel.AtMostOnce));
        await client.EnqueueAsync(Message("at-least-once", MqttQualityOfServiceLevel.AtLeastOnce));
        await client.EnqueueAsync(Message("after"));
        await UntilAsync(() => broker.Published.Any(message => message.Topic == "after"), "the queue went on");

        CollectionAssert.AreEqual(
            new[] { "at-least-once", "after" },
            broker.Published.Select(message => message.Topic).ToList(),
            "QoS 0 promises no delivery; from QoS 1 on the message is sent again, and in its place");
    }

    [TestMethod]
    public async Task AnUnsubscribe_IsSentAndRaised_AndTheFilterIsNotSentAgainAfterAReconnect()
    {
        var broker = new FakeMqttClient();
        using var client = Managed(broker);
        var answers = new ConcurrentQueue<SubscriptionsChangedEventArgs>();
        client.SubscriptionsChangedAsync += Record(answers);
        await client.SubscribeAsync(Values);
        await client.SubscribeAsync(Status);
        await client.StartAsync(Options());
        await UntilAsync(() => !answers.IsEmpty, "the SUBACK is raised");

        await client.UnsubscribeAsync(Status);
        await UntilAsync(() => answers.Any(answer => answer.UnsubscribeResult.Count > 0), "the UNSUBACK is raised");
        Assert.AreEqual(Status, broker.Unsubscribes.Single().TopicFilters.Single());

        var subscribesBefore = broker.Subscribes.Count;
        await broker.LoseConnectionAsync();
        await UntilAsync(() => broker.Subscribes.Count > subscribesBefore, "the reconnect subscribes again");

        Assert.AreEqual(Values, broker.Subscribes.Last().TopicFilters.Single().Topic);
    }

    [TestMethod]
    public async Task StopAsync_EndsTheLoops_DisconnectsCleanly_AndMayBeCalledTwice()
    {
        var broker = new FakeMqttClient();
        using var client = Managed(broker);
        await client.StartAsync(Options());
        await UntilAsync(() => client.IsConnected, "the client connects");

        await client.StopAsync();
        await client.StopAsync();
        var attempts = broker.ConnectAttempts;
        await Task.Delay(100, TestContext.CancellationToken);

        Assert.IsFalse(client.IsStarted);
        Assert.AreEqual(1, broker.Disconnects);
        Assert.AreEqual(attempts, broker.ConnectAttempts, "a stopped client does not reconnect");
    }

    [TestMethod]
    public async Task StartAsync_Twice_Throws()
    {
        using var client = Managed(new FakeMqttClient());
        await client.StartAsync(Options());

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => client.StartAsync(Options()));
    }

    [TestMethod]
    public async Task Dispose_DisposesTheClientItOwns_AndEndsTheLoops()
    {
        var broker = new FakeMqttClient();
        var client = Managed(broker);
        await client.StartAsync(Options());
        await UntilAsync(() => client.IsConnected, "the client connects");

        client.Dispose();
        var attempts = broker.ConnectAttempts;
        await Task.Delay(100, TestContext.CancellationToken);

        Assert.IsTrue(broker.IsDisposed);
        Assert.AreEqual(attempts, broker.ConnectAttempts);
        await Assert.ThrowsExactlyAsync<ObjectDisposedException>(() => client.EnqueueAsync(Message("a")));
    }

    private static ManagedMqttClient Managed(FakeMqttClient broker) => new(broker, new MqttNetNullLogger());

    private static ManagedMqttClientOptions Options(int maxPendingMessages = int.MaxValue) => new()
    {
        ClientOptions = new MqttClientOptions(),
        AutoReconnectDelay = TimeSpan.FromMilliseconds(20),
        ConnectionCheckInterval = TimeSpan.FromMilliseconds(20),
        MaxPendingMessages = maxPendingMessages,
    };

    private static MqttApplicationMessage Message(
        string topic, MqttQualityOfServiceLevel qualityOfServiceLevel = MqttQualityOfServiceLevel.AtMostOnce) =>
        new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload("{}")
            .WithQualityOfServiceLevel(qualityOfServiceLevel)
            .Build();

    private static Func<TEventArgs, Task> Record<TEventArgs>(ConcurrentQueue<TEventArgs> seen) => eventArgs =>
    {
        seen.Enqueue(eventArgs);
        return Task.CompletedTask;
    };

    private async Task UntilAsync(Func<bool> condition, string what)
    {
        using var patience = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        patience.CancelAfter(Patience);
        while (!condition())
        {
            try
            {
                await Task.Delay(10, patience.Token);
            }
            catch (OperationCanceledException)
            {
                Assert.Fail($"Waited {Patience.TotalSeconds:F0}s in vain until {what}.");
            }
        }
    }
}
