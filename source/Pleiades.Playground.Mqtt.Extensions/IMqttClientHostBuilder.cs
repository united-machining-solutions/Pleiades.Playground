using Microsoft.Extensions.Configuration;
using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Defines mqtt client host builder
/// </summary>
public interface IMqttClientHostBuilder
{
    /// <summary>
    /// Adds keyed mqtt client into host builder configuration
    /// </summary>
    /// <param name="name">Mqtt client name</param>
    /// <param name="configurationSection">Mqtt client configuration.</param>
    /// <returns>self</returns>
    IMqttClientHostBuilder AddClient(string name, IConfigurationSection configurationSection);

    /// <summary>
    /// Adds mqtt client into host builder configuration
    /// </summary>
    /// <param name="configurationSection">Mqtt client configuration.</param>
    /// <returns>self</returns>
    IMqttClientHostBuilder AddClient(IConfigurationSection configurationSection);

    /// <summary>
    /// Adds the mqtt client into host builder configuration, with options the configuration cannot give, such as
    /// a last will that names the machine: <paramref name="configure"/> runs on the options built from the
    /// configuration when the host starts the client.
    /// </summary>
    /// <param name="configurationSection">Mqtt client configuration.</param>
    /// <param name="configure">Sets further options, with the services of the host.</param>
    /// <returns>self</returns>
    IMqttClientHostBuilder AddClient(IConfigurationSection configurationSection, Action<IServiceProvider, MqttClientOptionsBuilder> configure);
}
