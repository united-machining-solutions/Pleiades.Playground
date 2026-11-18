using Microsoft.Extensions.Diagnostics.HealthChecks;
using Moq;
using NATS.Client.Core;

namespace Pleiades.Playground.Nats.Bridge.Test;

/// <summary>The settings of the nested section are checked, and the health check tells what the bridge can do.</summary>
[TestClass]
public sealed class ConfigValidatorTest
{
    [TestMethod]
    public void TheDefaults_AreValid()
    {
        Assert.IsEmpty(ConfigValidator.Errors(WorkerTest.ConfigWith()).ToList());
    }

    [TestMethod]
    [DataRow("SubjectPrefix", "local.*")]
    [DataRow("SubjectPrefix", "")]
    [DataRow("Url", " ")]
    [DataRow("PublishAttempts", "0")]
    [DataRow("RetryDelay", "-00:00:01")]
    [DataRow("Tls", "Sometimes")]
    [DataRow("Tls", "7")]
    [DataRow("StreamName", "")]
    public void AWrongSetting_IsNamed(string setting, string value)
    {
        var config = WorkerTest.ConfigWith();
        var nats = config.Nats;
        switch (setting)
        {
            case "SubjectPrefix": nats.SubjectPrefix = value; break;
            case "Url": nats.Url = value; break;
            case "PublishAttempts": nats.PublishAttempts = int.Parse(value, System.Globalization.CultureInfo.InvariantCulture); break;
            case "RetryDelay": nats.RetryDelay = TimeSpan.Parse(value, System.Globalization.CultureInfo.InvariantCulture); break;
            case "Tls": nats.Tls.Mode = value; break;
            case "StreamName": nats.CreateStream = true; nats.StreamName = value; break;
        }

        var errors = ConfigValidator.Errors(config).ToList();

        Assert.HasCount(1, errors);
        Assert.Contains(setting, errors[0]);
    }

    [TestMethod]
    [DataRow("disable")]
    [DataRow("Require")]
    public void ATlsMode_IsReadWhateverItsCase(string mode)
    {
        var config = WorkerTest.ConfigWith();
        config.Nats.Tls.Mode = mode;

        Assert.IsEmpty(ConfigValidator.Errors(config).ToList());
    }

    [TestMethod]
    [DataRow(NatsConnectionState.Open, null, HealthStatus.Healthy)]
    [DataRow(NatsConnectionState.Open, "no responders", HealthStatus.Unhealthy)]
    [DataRow(NatsConnectionState.Reconnecting, null, HealthStatus.Unhealthy)]
    [DataRow(NatsConnectionState.Closed, null, HealthStatus.Unhealthy)]
    public async Task TheHealthCheck_WantsAConnectionThatTakesTheMessages(NatsConnectionState state, string? drop, HealthStatus expected)
    {
        var connection = new Mock<INatsConnection>();
        connection.SetupGet(c => c.ConnectionState).Returns(state);
        var outcome = new PublishOutcome();
        if (drop is not null)
        {
            outcome.Dropped(drop);
        }

        var result = await new NatsHealthCheck(connection.Object, outcome).CheckHealthAsync(new HealthCheckContext());

        Assert.AreEqual(expected, result.Status);
    }
}
