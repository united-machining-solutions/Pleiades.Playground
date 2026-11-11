using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Diagnostics.Logger;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Provides extension methods for creating managed MQTT clients.
/// </summary>
public static class MqttClientFactoryExtension
{
    /// <summary>
    /// Creates a new <see cref="IManagedMqttClient"/> around a client of <paramref name="factory"/>.
    /// </summary>
    /// <param name="factory">The <see cref="MqttClientFactory"/> used to create the underlying client.</param>
    /// <param name="logger">The MQTTnet logger, or <see langword="null"/> for the default logger of the factory.</param>
    /// <returns>A managed client that is not started yet.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="factory"/> is null.</exception>
    public static IManagedMqttClient CreateManagedMqttClient(this MqttClientFactory factory, IMqttNetLogger? logger = null)
    {
        ArgumentNullException.ThrowIfNull(factory);

        logger ??= factory.DefaultLogger;
        return new ManagedMqttClient(factory.CreateMqttClient(logger), logger);
    }

    /// <summary>
    /// Creates a new instance of <see cref="IManagedMqttClient"/> with a logger.
    /// </summary>
    /// <param name="factory">The <see cref="MqttClientFactory"/> used to create the underlying client.</param>
    /// <param name="loggerFactory">The logger factory the MQTTnet log is written to.</param>
    /// <returns>An <see cref="IManagedMqttClient"/> instance configured with a logger.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="factory"/> is null.</exception>
    public static IManagedMqttClient CreateManagedMqttClientWithLogger(this MqttClientFactory factory, ILoggerFactory loggerFactory)
    {
        return factory.CreateManagedMqttClient(new MqttLogger(loggerFactory));
    }
}
