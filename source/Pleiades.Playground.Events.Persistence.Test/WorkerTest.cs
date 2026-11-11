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
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Persistence.Test;

[TestClass]
public class WorkerTest : IDisposable
{
    private readonly Mock<IManagedMqttClient> _mqttClient;
    private readonly Mock<INotificationEventService> _notificationEventService;

    private Object _data;

    private readonly Worker _worker;

    private bool _disposedValue;
    private const string _topic = "0000-0000/unittest";
    private readonly JsonSerializerOptions _jsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public WorkerTest()
    {
        _mqttClient = new Mock<IManagedMqttClient>();
        _notificationEventService = new Mock<INotificationEventService>();

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
