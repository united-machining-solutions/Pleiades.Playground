using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet.Client;
using MQTTnet.Exceptions;
using MQTTnet.Extensions.ManagedClient;

namespace Pleiades.Playground.HealthChecks.Mqtt.Test;

[TestClass]
public class MqttHealthCheckTest
{
    private readonly Mock<IManagedMqttClient> _client;
    private readonly Mock<IMqttClient> _internalClient;
    private readonly MqttHealthCheck _healthCheck;

    public required TestContext TestContext { get; set; }

    public MqttHealthCheckTest()
    {
        _internalClient = new Mock<IMqttClient>();
        _client = new Mock<IManagedMqttClient>();
        _client.Setup(c => c.InternalClient).Returns(_internalClient.Object);
        _healthCheck = new MqttHealthCheck(_client.Object);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsConnectedAndPingAnswered_ReturnsHealthy()
    {
        _client.Setup(c => c.IsConnected).Returns(true);

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.AreEqual("MQTT broker is connected.", result.Description);
        _internalClient.Verify(c => c.PingAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsNotConnected_ReturnsUnhealthyWithoutPing()
    {
        _client.Setup(c => c.IsConnected).Returns(false);

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual("MQTT broker is disconnected.", result.Description);
        _internalClient.Verify(c => c.PingAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsConnectedButPingFails_ReturnsUnhealthy()
    {
        // The stalled-connection case: IsConnected stays true, but nothing gets through.
        var timeout = new MqttCommunicationTimedOutException();
        _client.Setup(c => c.IsConnected).Returns(true);
        _internalClient.Setup(c => c.PingAsync(It.IsAny<CancellationToken>())).ThrowsAsync(timeout);

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual("MQTT broker is connected but does not answer a ping.", result.Description);
        Assert.AreSame(timeout, result.Exception);
    }

    [TestMethod]
    public async Task CheckHealthAsync_PingNeverAnswers_ReturnsUnhealthyAfterTimeout()
    {
        _client.Setup(c => c.IsConnected).Returns(true);
        _internalClient.Setup(c => c.PingAsync(It.IsAny<CancellationToken>()))
            .Returns<CancellationToken>(token => Task.Delay(Timeout.Infinite, token));

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual("MQTT broker is connected but did not answer a ping within 5s.", result.Description);
    }

    [TestMethod]
    public async Task CheckHealthAsync_CallerCancels_Throws()
    {
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();
        _client.Setup(c => c.IsConnected).Returns(true);
        _internalClient.Setup(c => c.PingAsync(It.IsAny<CancellationToken>()))
            .Returns<CancellationToken>(Task.FromCanceled);

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => _healthCheck.CheckHealthAsync(new HealthCheckContext(), cancellation.Token));
    }
}

[TestClass]
public class KeyedMqttHealthCheckTest
{
    private readonly Mock<IManagedMqttClient> _client;
    private readonly Mock<IMqttClient> _internalClient;
    private const string ClientName = "test-client";
    private readonly KeyedMqttHealthCheck _healthCheck;

    public required TestContext TestContext { get; set; }

    public KeyedMqttHealthCheckTest()
    {
        _internalClient = new Mock<IMqttClient>();
        _client = new Mock<IManagedMqttClient>();
        _client.Setup(c => c.InternalClient).Returns(_internalClient.Object);
        _healthCheck = new KeyedMqttHealthCheck(_client.Object, ClientName);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsConnectedAndPingAnswered_ReturnsHealthyWithClientName()
    {
        _client.Setup(c => c.IsConnected).Returns(true);

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.AreEqual($"MQTT broker '{ClientName}' is connected.", result.Description);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsNotConnected_ReturnsUnhealthyWithClientName()
    {
        _client.Setup(c => c.IsConnected).Returns(false);

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual($"MQTT broker '{ClientName}' is disconnected.", result.Description);
    }

    [TestMethod]
    public async Task CheckHealthAsync_IsConnectedButPingFails_ReturnsUnhealthyWithClientName()
    {
        _client.Setup(c => c.IsConnected).Returns(true);
        _internalClient.Setup(c => c.PingAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MqttCommunicationTimedOutException());

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual($"MQTT broker '{ClientName}' is connected but does not answer a ping.", result.Description);
    }
}
