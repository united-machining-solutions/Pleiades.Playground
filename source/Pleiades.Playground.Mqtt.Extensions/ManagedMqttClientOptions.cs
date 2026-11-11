using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Options of a <see cref="ManagedMqttClient"/>.
/// </summary>
public sealed class ManagedMqttClientOptions
{
    private const int AutoReconnectDelaySeconds = 10;

    /// <summary>How the underlying client connects to the broker.</summary>
    public required MqttClientOptions ClientOptions { get; init; }

    /// <summary>How long to wait after a failed connect attempt before the next one.</summary>
    public TimeSpan AutoReconnectDelay { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// How often the connection state is checked when nothing reports a change. A lost connection
    /// and a new subscription wake the loop at once, so this is only the upper bound.
    /// </summary>
    public TimeSpan ConnectionCheckInterval { get; init; } = TimeSpan.FromSeconds(1);

    /// <summary>
    /// The maximum number of queued outgoing messages. When it is reached, the oldest queued message
    /// is dropped for each new one. Default: unbounded.
    /// </summary>
    public int MaxPendingMessages { get; init; } = int.MaxValue;

    /// <summary>
    /// Creates the options from an <see cref="MqttConfig"/>.
    /// </summary>
    /// <param name="config">The MQTT configuration of a service.</param>
    /// <returns>The options for <see cref="IManagedMqttClient.StartAsync"/>.</returns>
    public static ManagedMqttClientOptions From(MqttConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);

        return new ManagedMqttClientOptions
        {
            ClientOptions = new MqttClientOptionsBuilder().WithConfig(config).Build(),
            AutoReconnectDelay = TimeSpan.FromSeconds(AutoReconnectDelaySeconds),
            MaxPendingMessages = config.MaxPendingMessages ?? int.MaxValue,
        };
    }
}
