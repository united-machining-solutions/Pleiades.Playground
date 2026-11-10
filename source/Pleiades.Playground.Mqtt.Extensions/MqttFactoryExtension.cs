using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Extensions.ManagedClient;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Provides extension methods for creating managed MQTT clients with additional functionality.
/// </summary>
public static class MqttFactoryExtension
{
    /// <summary>
    /// Creates a new instance of <see cref="IManagedMqttClient"/> with a logger.
    /// </summary>
    /// <param name="factory">The <see cref="MqttFactory"/> used to create the managed MQTT client.</param>
    /// <param name="loggerFactory"></param>
    /// <returns>An <see cref="IManagedMqttClient"/> instance configured with a logger.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="factory"/> is null.</exception>
    public static IManagedMqttClient CreateManagedMqttClientWithLogger(this MqttFactory factory, ILoggerFactory loggerFactory)
    {
        return factory.CreateManagedMqttClient(new MqttLogger(loggerFactory));
    }
}
