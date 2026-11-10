using System.Collections.Immutable;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet.Extensions.ManagedClient;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Builder pattern implementation for creating MQTT clients
/// </summary>
public static class MqttClientBuilderExtensions
{
    /// <summary>
    /// Registers Mqtt client host
    /// </summary>
    /// <param name="services">.</param>
    /// <returns>Host builder for client registrations</returns>
    public static IMqttClientHostBuilder AddMqttClientHost(this IServiceCollection services)
    {
        var builder = new MqttClientHostBuilder(services);
        services.AddHostedService(provider =>
        {
            var config = provider.GetRequiredService<IOptionsMonitor<MqttConfig>>();
            var logger = provider.GetRequiredService<ILogger<MqttClientHost>>();
            var clients = builder.ClientNames.ToImmutableDictionary(name => name, name => provider.GetRequiredKeyedService<IManagedMqttClient>(name));

            return new MqttClientHost(clients, config, logger);
        });
        return builder;
    }
}
