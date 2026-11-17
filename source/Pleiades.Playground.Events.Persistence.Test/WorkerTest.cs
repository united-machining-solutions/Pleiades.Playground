using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using Moq;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Events.Api.Client.JobEvents;
using Pleiades.Playground.Events.Api.Client.WorkMasterEvents;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Persistence.Test;

[TestClass]
public class WorkerTest : IDisposable
{
    private readonly Mock<IManagedMqttClient> _mqttClient;
    private readonly Mock<INotificationEventService> _notificationEventService;
    private readonly Mock<IJobEventService> _jobEventService;
    private readonly Mock<IWorkMasterEventService> _workMasterEventService;

    private Object _data;

    private readonly Worker _worker;

    private bool _disposedValue;
    private const string _topic = "0000-0000/unittest";
    private readonly JsonSerializerOptions _jsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public WorkerTest()
    {
        _mqttClient = new Mock<IManagedMqttClient>();
        _notificationEventService = new Mock<INotificationEventService>();
        _jobEventService = new Mock<IJobEventService>();
        _workMasterEventService = new Mock<IWorkMasterEventService>();

        _data = new();

        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile("appsettings.test.json", optional: true, reloadOnChange: true)
            .Build();

        var configSection = config.GetSection("Config");
        var configOptions = Options.Create(configSection.Get<Config>() ?? throw new InvalidOperationException("Missing or invalid configuration."));

        _worker = new Worker(configOptions,
                             NullLogger<Worker>.Instance,
                             _mqttClient.Object,
                             _notificationEventService.Object,
                             _jobEventService.Object,
                             _workMasterEventService.Object,
                             new MqttSubscriptionReadiness());
    }

    [TestMethod]
    public async Task NotificationEventTest()
    {
        _notificationEventService.Setup(s => s.PostEvent(It.IsAny<NotificationEventDtoV1>()))
            .ReturnsAsync((NotificationEventDtoV1 model) =>
            {
                _data = model;
                return model;
            });

        var notificationEvent = new NotificationEventDtoV1
        {
            Id = ObjectId.GenerateNewId().ToString(),
            MId = "0001-0001",
            Timestamp = DateTime.UtcNow,
            Action = NotificationAction.Raised,
        };

        var payload = JsonSerializer.Serialize(notificationEvent, _jsonSerializerOptions);

        _mqttClient.Setup(x => x.IsConnected).Returns(true);

        // Act
        await _worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(500).ConfigureAwait(false);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("notificationeventdtov1")
            .WithPayload(payload).Build();

        await _mqttClient.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(2000).ConfigureAwait(false);

        // Assert
        Assert.IsInstanceOfType<NotificationEventDtoV1>(_data);
    }

    [TestMethod]
    public async Task JobEvent_GoesToTheJobEventService()
    {
        var posted = new List<JobEventDtoV1>();
        _jobEventService.Setup(s => s.PostEvent(It.IsAny<JobEventDtoV1>()))
            .ReturnsAsync((JobEventDtoV1 model) =>
            {
                posted.Add(model);
                return model;
            });

        var jobEvent = new JobEventDtoV1
        {
            Id = "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60",
            MId = "P-04",
            Timestamp = DateTime.UtcNow,
            Action = JobAction.ResultChanged,
            CorrelationId = "4711/01",
            JobOrderId = "4711/01",
            State = "Running",
            ProducedQuantity = 3,
            Seq = 7,
        };

        await _worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(500).ConfigureAwait(false);
        await Deliver("jobeventdtov1", JsonSerializer.Serialize(jobEvent, _jsonSerializerOptions), "jobs").ConfigureAwait(false);
        await Task.Delay(1000).ConfigureAwait(false);

        Assert.HasCount(1, posted);
        Assert.AreEqual(jobEvent, posted[0]);
        _workMasterEventService.Verify(s => s.PostEvent(It.IsAny<WorkMasterEventDtoV1>()), Times.Never);
        _notificationEventService.Verify(s => s.PostEvent(It.IsAny<NotificationEventDtoV1>()), Times.Never);
    }

    [TestMethod]
    public async Task WorkMasterEvent_GoesToTheWorkMasterEventService()
    {
        var posted = new List<WorkMasterEventDtoV1>();
        _workMasterEventService.Setup(s => s.PostEvent(It.IsAny<WorkMasterEventDtoV1>()))
            .ReturnsAsync((WorkMasterEventDtoV1 model) =>
            {
                posted.Add(model);
                return model;
            });

        var workMasterEvent = new WorkMasterEventDtoV1
        {
            Id = "7a1c",
            MId = "P-04",
            Timestamp = DateTime.UtcNow,
            Action = WorkMasterAction.Ended,
            CorrelationId = "exec-1",
            ExecutionId = "exec-1",
            State = "Ended",
            EnergyElectricity = 720_000,
            Seq = 7,
        };

        await _worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(500).ConfigureAwait(false);
        await Deliver("workmastereventdtov1", JsonSerializer.Serialize(workMasterEvent, _jsonSerializerOptions), "workmasters").ConfigureAwait(false);
        await Task.Delay(1000).ConfigureAwait(false);

        Assert.HasCount(1, posted);
        Assert.AreEqual(workMasterEvent, posted[0]);
        _jobEventService.Verify(s => s.PostEvent(It.IsAny<JobEventDtoV1>()), Times.Never);
    }

    [TestMethod]
    public async Task UnknownContentType_GoesNowhere()
    {
        await _worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(500).ConfigureAwait(false);
        // The production event of an earlier draft is gone; its content type is now an unknown one.
        await Deliver("productioneventdtov1", "{}").ConfigureAwait(false);
        await Deliver("jobeventdtov2", "{}").ConfigureAwait(false);
        await Task.Delay(500).ConfigureAwait(false);

        _jobEventService.Verify(s => s.PostEvent(It.IsAny<JobEventDtoV1>()), Times.Never);
        _workMasterEventService.Verify(s => s.PostEvent(It.IsAny<WorkMasterEventDtoV1>()), Times.Never);
        _notificationEventService.Verify(s => s.PostEvent(It.IsAny<NotificationEventDtoV1>()), Times.Never);
    }

    private async Task Deliver(string contentType, string payload, string kind = "jobs")
    {
        var message = new MqttApplicationMessageBuilder()
            .WithTopic($"machines/P-04/events/{kind}")
            .WithContentType(contentType)
            .WithPayload(payload).Build();

        await _mqttClient.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null,
            (object)new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null)).ConfigureAwait(false);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposedValue)
        {
            if (disposing)
            {
                _worker?.Dispose();
            }
            _disposedValue = true;
        }
    }

    public void Dispose()
    {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);
    }
}
