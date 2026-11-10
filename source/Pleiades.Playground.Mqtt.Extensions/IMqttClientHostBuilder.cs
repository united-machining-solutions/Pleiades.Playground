using Microsoft.Extensions.Configuration;

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
}
