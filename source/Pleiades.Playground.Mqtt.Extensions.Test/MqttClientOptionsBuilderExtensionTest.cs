using System.Net;
using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions.Test;

/// <summary>
/// What <see cref="MqttConfig"/> becomes for MQTTnet. The demo stack connects without TLS, so these
/// tests are what keeps TLS and WebSocket configurations working: <c>WithConnectionUri</c> of
/// MQTTnet 5 replaces the TLS options, which once dropped <c>UseTls</c> and the validation handler.
/// </summary>
[TestClass]
public sealed class MqttClientOptionsBuilderExtensionTest
{
    [TestMethod]
    [DataRow("mqtt://broker:1883", false, false)]
    [DataRow("mqtt://broker:8883", true, true)]
    [DataRow("mqtts://broker:8883", false, true)]
    [DataRow("mqtts://broker:8883", true, true)]
    public void OverTcp_TlsFollowsTheFlagOrTheScheme(string connectionString, bool useTlsFlag, bool expectedTls)
    {
        var options = Build(new MqttConfig { ConnectionString = connectionString, UseTls = useTlsFlag });

        var channel = Assert.IsInstanceOfType<MqttClientTcpOptions>(options.ChannelOptions);
        var endpoint = Assert.IsInstanceOfType<DnsEndPoint>(channel.RemoteEndpoint);
        Assert.AreEqual("broker", endpoint.Host);
        Assert.AreEqual(new Uri(connectionString).Port, endpoint.Port);
        Assert.AreEqual(expectedTls, channel.TlsOptions.UseTls);
        AssertTrustsEveryCertificate(channel.TlsOptions);
    }

    [TestMethod]
    [DataRow("ws://broker:9001/mqtt", false, false)]
    [DataRow("wss://broker:8884/mqtt", false, true)]
    [DataRow("wss://broker:8884/mqtt", true, true)]
    public void OverWebSocketByScheme_TlsFollowsTheScheme(string connectionString, bool useTlsFlag, bool expectedTls)
    {
        var options = Build(new MqttConfig { ConnectionString = connectionString, UseTls = useTlsFlag });

        var channel = Assert.IsInstanceOfType<MqttClientWebSocketOptions>(options.ChannelOptions);
        Assert.AreEqual(connectionString, channel.Uri);
        Assert.AreEqual(expectedTls, channel.TlsOptions.UseTls);
        Assert.AreEqual(TimeSpan.Zero, channel.KeepAliveInterval, "liveness is the MQTT ping, not the WebSocket keep-alive");
        AssertTrustsEveryCertificate(channel.TlsOptions);
    }

    [TestMethod]
    [DataRow("broker:8884/mqtt", "wss://broker:8884/mqtt")]
    [DataRow("wss://broker:8884/mqtt", "wss://broker:8884/mqtt")]
    public void WithUseSecureWebSocket_TheAddressMayComeWithoutItsScheme(string connectionString, string expectedAddress)
    {
        // MQTTnet 4 took "host:port/path"; MQTTnet 5 throws on it when the options are built.
        var options = Build(new MqttConfig { ConnectionString = connectionString, UseSecureWebSocket = true });

        var channel = Assert.IsInstanceOfType<MqttClientWebSocketOptions>(options.ChannelOptions);
        Assert.AreEqual(expectedAddress, channel.Uri);
        Assert.IsTrue(channel.TlsOptions.UseTls);
        Assert.AreEqual(TimeSpan.Zero, channel.KeepAliveInterval);
        AssertTrustsEveryCertificate(channel.TlsOptions);
    }

    [TestMethod]
    public void CredentialsClientIdAndSession_ComeFromTheConfig()
    {
        var options = Build(new MqttConfig
        {
            ConnectionString = "mqtts://broker:8883",
            User = "reader",
            Password = "a test value",
            ClientId = "timeseries-persistence",
            CleanSession = false,
        });

        Assert.AreEqual("reader", options.Credentials.GetUserName(options));
        Assert.AreEqual("timeseries-persistence", options.ClientId);
        Assert.IsFalse(options.CleanSession);
        Assert.AreEqual(TimeSpan.FromSeconds(15), options.Timeout);
    }

    private static MqttClientOptions Build(MqttConfig config) => ManagedMqttClientOptions.From(config).ClientOptions;

    private static void AssertTrustsEveryCertificate(MqttClientTlsOptions tlsOptions)
    {
        Assert.IsNotNull(tlsOptions.CertificateValidationHandler, "without the handler a certificate of a private authority is refused");
        Assert.IsTrue(tlsOptions.CertificateValidationHandler(null!));
    }
}
