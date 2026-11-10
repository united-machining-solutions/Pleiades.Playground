using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Server;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
///     Builder extension for creating MqttClientOptions
/// </summary>
public static class MqttClientOptionsBuilderExtension
{
    private const int KeepAlivePeriodSeconds = 60;
    private const int OperationTimeoutSeconds = 15;
    private const int AutoReconnectDelaySeconds = 10;

    /// <summary>
    ///     Sets the connection parameters on a MqttClientOptionsBuilder from a mqtt config
    /// </summary>
    public static MqttClientOptionsBuilder WithConfig(this MqttClientOptionsBuilder builder, MqttConfig config)
    {
        _ = builder ?? throw new ArgumentNullException(nameof(builder));
        _ = config ?? throw new ArgumentNullException(nameof(config));

        var retBuilder = builder
            .WithProtocolVersion(config.ProtocolVersion)
            .WithCredentials(config.User, config.Password)
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(KeepAlivePeriodSeconds))
            .WithTimeout(TimeSpan.FromSeconds(OperationTimeoutSeconds))
            .WithCleanSession(config.CleanSession)
            .WithTlsOptions(tlsOptions =>
            {
                tlsOptions
                    .UseTls(config.UseTls)
                    .WithCertificateValidationHandler(_ => true);
            });

        if (!string.IsNullOrWhiteSpace(config.ClientId))
        {
            retBuilder = retBuilder.WithClientId(config.ClientId);
        }

        if (config.UseSecureWebSocket)
        {
            return retBuilder
                .WithWebSocketServer(webSocketOptionsBuilder => ConfigureWebSocket(webSocketOptionsBuilder, config.ConnectionString))
                .WithTlsOptions(tlsOptions =>
                {
                    tlsOptions
                        .UseTls()
                        .WithCertificateValidationHandler(_ => true); // Trust all certificates
                });
        }

        var uri = new Uri(config.ConnectionString);
        retBuilder = retBuilder.WithConnectionUri(uri);
        if (uri.Scheme is "ws" or "wss")
        {
            retBuilder = retBuilder.WithWebSocketServer(webSocketOptionsBuilder => ConfigureWebSocket(webSocketOptionsBuilder, uri.ToString()));
        }

        return retBuilder;
    }

    /// <summary>
    ///     Sets the connection parameters on a ManagedMqttClientOptionsBuilder from a mqtt config
    /// </summary>
    public static ManagedMqttClientOptionsBuilder WithConfig(this ManagedMqttClientOptionsBuilder builder, MqttConfig config)
    {
        _ = builder ?? throw new ArgumentNullException(nameof(builder));
        _ = config ?? throw new ArgumentNullException(nameof(config));

        var clientOptionsBuilder = new MqttClientOptionsBuilder().WithConfig(config);

        var retBuilder = builder
            .WithAutoReconnectDelay(TimeSpan.FromSeconds(AutoReconnectDelaySeconds))
            .WithClientOptions(clientOptionsBuilder.Build());

        if (config.MaxPendingMessages is { } maxPendingMessages)
        {
            retBuilder = retBuilder
                .WithMaxPendingMessages(maxPendingMessages)
                .WithPendingMessagesOverflowStrategy(MqttPendingMessagesOverflowStrategy.DropOldestQueuedMessage);
        }

        return retBuilder;
    }

    // WebSocket keep-alive frames are sent without a timeout and block all sends forever when the peer stalls.
    // Liveness is covered by the MQTT ping instead.
    private static void ConfigureWebSocket(MqttClientWebSocketOptionsBuilder builder, string connectionString)
    {
        builder.WithUri(connectionString).WithKeepAliveInterval(TimeSpan.Zero);
    }
}
