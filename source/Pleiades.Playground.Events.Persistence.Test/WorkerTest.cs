using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using MQTTnet.Packets;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Events.Api.Client.Exceptions;
using Pleiades.Playground.Events.Api.Client.MachineEvents;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Events.Persistence.Test;

/// <summary>
/// The worker hands a CloudEvent of a machine on as it came, with the machine id of its topic, and drops what is no
/// CloudEvent.
/// </summary>
[TestClass]
public sealed class WorkerTest : IDisposable
{
    private const string MachineId = "alcyone-machines_AX-400_P-04";
    private const string CloudEvent = """
        { "specversion": "1.0", "id": "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60", "source": "https://www.alcyone-machines.example/AX-400/P-04",
          "type": "Notification.AlertRaised", "time": "2026-11-17T09:00:00.000Z", "sequence": "20261117T060000Z.000000000001",
          "data": { "Id": "a-1", "ErrorCode": "20017", "Message": "Coolant pressure low", "Severity": "OffSpec", "Time": "2026-11-17T09:00:00.000Z" } }
        """;

    private static readonly string[] EventTopics = ["machines/+/events/jobs", "machines/+/events/workmasters", "machines/+/events/notifications"];

    private readonly Mock<IManagedMqttClient> _mqttClient = new();
    private readonly Mock<IMachineEventService> _machineEventService = new();
    private readonly List<MachineEventInputDtoV1> _posted = [];
    private readonly Worker _worker;

    public TestContext TestContext { get; set; } = null!;

    public WorkerTest()
    {
        _machineEventService.Setup(s => s.PostEvent(It.IsAny<MachineEventInputDtoV1>()))
            .ReturnsAsync((MachineEventInputDtoV1 input) =>
            {
                _posted.Add(input);
                return new MachineEventDtoV1
                {
                    MId = input.MId,
                    Group = "Notification",
                    Type = input.CloudEvent.GetProperty("type").GetString()!,
                    Id = input.CloudEvent.GetProperty("id").GetString()!,
                    Source = input.CloudEvent.GetProperty("source").GetString()!,
                };
            });

        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.test.json", optional: true)
            .Build()
            .GetSection("Config")
            .Get<Config>() ?? throw new InvalidOperationException("Missing or invalid configuration.");

        _worker = new Worker(Options.Create(config), NullLogger<Worker>.Instance, _mqttClient.Object, _machineEventService.Object,
            new MqttSubscriptionReadiness());
    }

    private async Task StartAsync()
    {
        await _worker.StartAsync(TestContext.CancellationToken);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!_mqttClient.Invocations.Any(i => i.Method.Name == "add_ApplicationMessageReceivedAsync"))
        {
            Assert.IsLessThan(deadline, DateTime.UtcNow, "the worker never attached its message handler");
            await Task.Delay(10, TestContext.CancellationToken);
        }
    }

    private async Task Deliver(string topic, string? contentType, string payload)
    {
        var builder = new MqttApplicationMessageBuilder().WithTopic(topic).WithPayload(payload);
        if (contentType is not null)
        {
            builder = builder.WithContentType(contentType);
        }
        await _mqttClient.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null,
            new MqttApplicationMessageReceivedEventArgs("", builder.Build(), new MqttPublishPacket(), null));
    }

    [TestMethod]
    [DataRow("application/cloudevents+json; charset=utf-8")]
    [DataRow("application/cloudevents+json")]
    [DataRow("Application/CloudEvents+JSON;charset=UTF-8")]
    public async Task ACloudEvent_GoesToTheEventsApi_AsItCame_WithTheMachineIdOfItsTopic(string contentType)
    {
        await StartAsync();

        await Deliver($"machines/{MachineId}/events/notifications", contentType, CloudEvent);

        var posted = _posted.Single();
        Assert.AreEqual(MachineId, posted.MId);
        Assert.AreEqual("Notification.AlertRaised", posted.CloudEvent.GetProperty("type").GetString());
        Assert.AreEqual("OffSpec", posted.CloudEvent.GetProperty("data").GetProperty("Severity").GetString(), "the data unchanged");
    }

    [TestMethod]
    [DataRow("productioneventdtov1", "{}")]
    [DataRow("notificationeventdtov1", "{}")]
    [DataRow("application/json", "{}")]
    [DataRow("application/cloudevents+json", "not json")]
    [DataRow("application/cloudevents+json", "[1, 2]")]
    public async Task WhatIsNoCloudEvent_GoesNowhere(string contentType, string payload)
    {
        await StartAsync();

        await Deliver($"machines/{MachineId}/events/notifications", contentType, payload);

        Assert.IsEmpty(_posted);
    }

    [TestMethod]
    [DataRow(HttpStatusCode.Conflict, LogLevel.Debug)]
    [DataRow(HttpStatusCode.InternalServerError, LogLevel.Warning)]
    public async Task AnEventStoredBefore_IsASuccess_AFailureIsAWarning(HttpStatusCode status, LogLevel expected)
    {
        var logger = new Mock<ILogger<Worker>>();
        logger.Setup(l => l.IsEnabled(It.IsAny<LogLevel>())).Returns(true);
        var service = new Mock<IMachineEventService>();
        service.Setup(s => s.PostEvent(It.IsAny<MachineEventInputDtoV1>()))
            .ThrowsAsync(new PleiadesEventPersistenceException($"{status} - writing to db failed") { StatusCode = status });
        var config = new ConfigurationBuilder().AddJsonFile("appsettings.json", optional: false).Build().GetSection("Config").Get<Config>()!;
        using var worker = new Worker(Options.Create(config), logger.Object, _mqttClient.Object, service.Object, new MqttSubscriptionReadiness());
        await worker.StartAsync(TestContext.CancellationToken);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!_mqttClient.Invocations.Any(i => i.Method.Name == "add_ApplicationMessageReceivedAsync"))
        {
            Assert.IsLessThan(deadline, DateTime.UtcNow, "the worker never attached its message handler");
            await Task.Delay(10, TestContext.CancellationToken);
        }

        await Deliver($"machines/{MachineId}/events/notifications", "application/cloudevents+json", CloudEvent);

        var levels = logger.Invocations.Where(i => i.Method.Name == nameof(ILogger.Log)).Select(i => (LogLevel)i.Arguments[0]).ToList();
        CollectionAssert.Contains(levels, expected);
        if (expected == LogLevel.Debug)
        {
            CollectionAssert.DoesNotContain(levels, LogLevel.Warning, "a duplicate is not reported as not stored");
        }
    }

    [TestMethod]
    public async Task ACloudEventOnATopicWithoutMachineId_GoesNowhere()
    {
        await StartAsync();

        await Deliver("sites/demo/events/notifications", "application/cloudevents+json", CloudEvent);

        Assert.IsEmpty(_posted);
    }

    [TestMethod]
    public async Task TheWorker_SubscribesToTheThreeEventTopics_WithQos1()
    {
        await StartAsync();

        var filters = _mqttClient.Invocations
            .Where(i => i.Method.Name == nameof(IManagedMqttClient.SubscribeAsync))
            .SelectMany(i => (IEnumerable<MqttTopicFilter>)i.Arguments[0]!)
            .ToList();

        CollectionAssert.AreEquivalent(EventTopics, filters.Select(f => f.Topic).ToList());
        Assert.IsTrue(filters.All(f => f.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce));
    }

    [TestMethod]
    [DataRow("machines/alcyone-machines_AX-400_P-04/events/jobs", "alcyone-machines_AX-400_P-04")]
    [DataRow("machines/x/events/notifications", "x")]
    [DataRow("machines/x/umati/State/Status", null)]
    [DataRow("sites/demo/events/x", null)]
    [DataRow("machines//events/x", null)]
    public void MachineIdOf_IsTheSecondLevelOfAnEventTopic(string topic, string? machineId)
    {
        Assert.AreEqual(machineId, Worker.MachineIdOf(topic));
    }

    [TestMethod]
    public void Settings_AskForAPersistentSession()
    {
        var config = new ConfigurationBuilder().AddJsonFile("appsettings.json", optional: false).Build().GetSection("Config").Get<Config>()!;

        Assert.IsFalse(config.MqttSource.CleanSession, "Clean Start false: the broker keeps the session");
        Assert.AreEqual(TimeSpan.FromDays(1), config.MqttSource.SessionExpiry);
        Assert.IsFalse(string.IsNullOrWhiteSpace(config.MqttSource.ClientId), "a session needs a fixed client id");
    }

    public void Dispose()
    {
        _worker.Dispose();
    }
}
