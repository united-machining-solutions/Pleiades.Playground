using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Events.Persistence.Test;

/// <summary>
/// A message without a ContentType - what every MQTT 3.1.1 publisher sends - is dropped and logged like an
/// unknown type, and nothing leaves the handler.
/// </summary>
/// <remarks>
/// Without the explicit check an <c>ArgumentNullException</c> would leave the handler, and the worker
/// would survive only because MQTTnet catches it. This test pins that the worker itself decides it.
/// </remarks>
[TestClass]
public sealed class AbsentContentTypeTest
{
    /// <summary>The event id of <c>LogErrorByHandlingMessage</c>, the default branch's log line.</summary>
    private const int ErrorByHandlingMessage = 6;

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AMessageWithoutContentType_IsLoggedAndDropped_AndTheHandlerDoesNotThrow()
    {
        var client = new Mock<IManagedMqttClient>();
        var logger = new Mock<ILogger<Worker>>();
        logger.Setup(l => l.IsEnabled(It.IsAny<LogLevel>())).Returns(true);
        var notifications = new Mock<INotificationEventService>();
        using var worker = new Worker(Config(), logger.Object, client.Object, notifications.Object,
            new MqttSubscriptionReadiness());

        await worker.StartAsync(TestContext.CancellationToken);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!client.Invocations.Any(i => i.Method.Name == "add_ApplicationMessageReceivedAsync"))
        {
            Assert.IsLessThan(deadline, DateTime.UtcNow, "the worker never attached its message handler");
            await Task.Delay(10, TestContext.CancellationToken);
        }

        // No WithContentType at all - that is the whole point of this message.
        var message = new MqttApplicationMessageBuilder()
            .WithTopic("machines/0000-0000/events/no-contenttype")
            .WithPayload("""{"anything":"at all"}""")
            .Build();
        await client.RaiseAsync(c => c.ApplicationMessageReceivedAsync += null,
            new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null));

        logger.Verify(l => l.Log(
                LogLevel.Error,
                It.Is<EventId>(e => e.Id == ErrorByHandlingMessage),
                It.IsAny<It.IsAnyType>(),
                It.IsAny<Exception?>(),
                (Func<It.IsAnyType, Exception?, string>)It.IsAny<object>()),
            Times.Once(), "the message is logged on the default branch's path");
        Assert.IsEmpty(notifications.Invocations, "nothing is posted for a message the worker cannot type");

        await worker.StopAsync(TestContext.CancellationToken);
    }

    private static IOptions<Config> Config()
    {
        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.test.json", optional: true)
            .Build()
            .GetSection("Config")
            .Get<Config>() ?? throw new InvalidOperationException("Missing or invalid configuration.");
        return Options.Create(config);
    }
}
