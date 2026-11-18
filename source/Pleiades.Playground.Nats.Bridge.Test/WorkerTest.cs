using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using MQTTnet.Packets;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Nats.Bridge.Test;

/// <summary>
/// The worker sends every message of the binding on to NATS, waits while NATS is away, tries a failed publish again
/// and drops it in the end.
/// </summary>
[TestClass]
public sealed class WorkerTest : IDisposable
{
    private const string Topic = "machines/alcyone-machines_AX-400_P-04/umati/State/Status";
    private const string Envelope = """{ "timestamp": "2026-11-17T09:15:00Z", "value": { "MachineryItemState": "Executing" } }""";

    private readonly Mock<IManagedMqttClient> _mqttClient = new();
    private readonly Mock<ICloudEventPublisher> _publisher = new();
    private readonly List<NatsCloudEvent> _published = [];
    private readonly PublishOutcome _outcome = new();
    private Worker? _worker;

    public TestContext TestContext { get; set; } = null!;

    internal static Config ConfigWith(bool forwardRetained = true, int attempts = 3)
    {
        var config = new Config
        {
            MqttSource = new MqttConfig { ConnectionString = "mqtt://localhost:1883" },
            Nats = new NatsConfig { PublishAttempts = attempts, RetryDelay = TimeSpan.Zero },
            ForwardRetained = forwardRetained,
            Loki = new SerilogLokiConfig { Sinks = [] },
        };
        config.Topics.Add("machines/+/umati/#");
        return config;
    }

    private Worker CreateWorker(Config config)
    {
        _publisher.SetupGet(p => p.IsConnected).Returns(true);
        _publisher.Setup(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()))
            .Callback((NatsCloudEvent e, CancellationToken _) => _published.Add(e))
            .Returns(Task.CompletedTask);
        _worker?.Dispose();
        _worker = new Worker(Options.Create(config), NullLogger<Worker>.Instance, _mqttClient.Object, _publisher.Object,
            new MqttSubscriptionReadiness(), _outcome);
        return _worker;
    }

    private static MqttApplicationMessageReceivedEventArgs Message(string topic, string payload, bool retained = false) =>
        new("", new MqttApplicationMessageBuilder().WithTopic(topic).WithPayload(payload).WithRetainFlag(retained).Build(),
            new MqttPublishPacket(), null);

    [TestMethod]
    public async Task AValue_GoesToNats()
    {
        var worker = CreateWorker(ConfigWith());

        await worker.HandleMessageAsync(Message(Topic, Envelope));

        var published = _published.Single();
        Assert.AreEqual("local.pleiades.machines.alcyone-machines_AX-400_P-04.umati.State.Status", published.Subject);
        Assert.AreEqual(CloudEventMapper.MachineValueType, published.Type);
        Assert.IsNull(_outcome.LastDrop);
    }

    [TestMethod]
    public async Task ARetainedValue_GoesToNats_OnlyWhenSoConfigured()
    {
        await CreateWorker(ConfigWith(forwardRetained: false)).HandleMessageAsync(Message(Topic, Envelope, retained: true));
        Assert.IsEmpty(_published);

        await CreateWorker(ConfigWith(forwardRetained: true)).HandleMessageAsync(Message(Topic, Envelope, retained: true));
        Assert.HasCount(1, _published);
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("not json")]
    public async Task AnEmptyOrBrokenPayload_GoesNowhere(string payload)
    {
        await CreateWorker(ConfigWith()).HandleMessageAsync(Message(Topic, payload));

        _publisher.Verify(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestMethod]
    public async Task AFailedPublish_IsTriedAgain()
    {
        var worker = CreateWorker(ConfigWith(attempts: 3));
        _publisher.SetupSequence(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("no responders"))
            .Returns(Task.CompletedTask);

        await worker.HandleMessageAsync(Message(Topic, Envelope));

        _publisher.Verify(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
        Assert.IsNull(_outcome.LastDrop);
    }

    [TestMethod]
    public async Task APublishThatKeepsFailing_IsDroppedAfterTheLastAttempt_AndSaysSo()
    {
        var worker = CreateWorker(ConfigWith(attempts: 3));
        _publisher.Setup(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("no responders"));

        await worker.HandleMessageAsync(Message(Topic, Envelope));

        _publisher.Verify(p => p.PublishAsync(It.IsAny<NatsCloudEvent>(), It.IsAny<CancellationToken>()), Times.Exactly(3));
        Assert.AreEqual("no responders", _outcome.LastDrop);
    }

    [TestMethod]
    public async Task WhileNatsIsAway_TheMessageWaits_WithoutUsingUpItsAttempts()
    {
        var worker = CreateWorker(ConfigWith(attempts: 1));
        _publisher.SetupSequence(p => p.IsConnected).Returns(false).Returns(false).Returns(true);

        await worker.HandleMessageAsync(Message(Topic, Envelope));

        Assert.HasCount(1, _published, "sent once the connection stands, although only one attempt is allowed");
    }

    [TestMethod]
    public async Task WhenTheServiceStops_TheMessageIsNotAcknowledged()
    {
        var worker = CreateWorker(ConfigWith());
        _publisher.SetupGet(p => p.IsConnected).Returns(false);
        _mqttClient.Setup(c => c.StopAsync()).Returns(Task.CompletedTask);
        await worker.StartAsync(TestContext.CancellationToken);

        var handling = worker.HandleMessageAsync(Message(Topic, Envelope));
        await worker.StopAsync(TestContext.CancellationToken);

        // The handler throws: MQTTnet then sends no PUBACK, and the broker keeps the message in the session.
        await Assert.ThrowsAsync<OperationCanceledException>(async () => await handling);
        Assert.IsEmpty(_published);
    }

    public void Dispose() => _worker?.Dispose();
}
