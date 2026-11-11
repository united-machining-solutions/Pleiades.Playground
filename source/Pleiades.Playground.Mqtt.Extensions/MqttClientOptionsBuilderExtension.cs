using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
///     Builder extension for creating MqttClientOptions
/// </summary>
public static class MqttClientOptionsBuilderExtension
{
    private const int KeepAlivePeriodSeconds = 60;
    private const int OperationTimeoutSeconds = 15;

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
            .WithCleanSession(config.CleanSession);

        if (!string.IsNullOrWhiteSpace(config.ClientId))
        {
            retBuilder = retBuilder.WithClientId(config.ClientId);
        }

        bool useTls;
        if (config.UseSecureWebSocket)
        {
            var webSocketUri = WithWebSocketScheme(config.ConnectionString);
            retBuilder = retBuilder.WithWebSocketServer(webSocketOptionsBuilder => ConfigureWebSocket(webSocketOptionsBuilder, webSocketUri));
            useTls = true;
        }
        else
        {
            var uri = new Uri(config.ConnectionString);
            retBuilder = retBuilder.WithConnectionUri(uri);
            if (uri.Scheme is "ws" or "wss")
            {
                retBuilder = retBuilder.WithWebSocketServer(webSocketOptionsBuilder => ConfigureWebSocket(webSocketOptionsBuilder, uri.ToString()));
            }

            useTls = config.UseTls || uri.Scheme is "mqtts" or "wss";
        }

        // Last on purpose. WithConnectionUri of MQTTnet 5 replaces the TLS options with its own: none for
        // mqtt:// and ws://, and for mqtts:// and wss:// options without the validation handler. Set before
        // it, UseTls would be dropped and a certificate of a private authority refused.
        return retBuilder.WithTlsOptions(tlsOptions =>
        {
            tlsOptions
                .UseTls(useTls)
                .WithCertificateValidationHandler(_ => true); // Trust all certificates
        });
    }

    // MQTTnet 5 takes a WebSocket address only with its scheme; MQTTnet 4 also took "host:port/path", and that
    // is what configurations with UseSecureWebSocket carry.
    private static string WithWebSocketScheme(string connectionString)
    {
        return connectionString.StartsWith("ws://", StringComparison.OrdinalIgnoreCase)
            || connectionString.StartsWith("wss://", StringComparison.OrdinalIgnoreCase)
            ? connectionString
            : "wss://" + connectionString;
    }

    // WebSocket keep-alive frames are sent without a timeout and block all sends forever when the peer stalls.
    // Liveness is covered by the MQTT ping instead.
    private static void ConfigureWebSocket(MqttClientWebSocketOptionsBuilder builder, string connectionString)
    {
        builder.WithUri(connectionString).WithKeepAliveInterval(TimeSpan.Zero);
    }
}
