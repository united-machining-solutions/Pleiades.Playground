using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

internal sealed class MqttClientHostBuilder(IServiceCollection services) : IMqttClientHostBuilder
{
    internal ICollection<string> ClientNames { get; } = [];

    /// <summary>What sets further options of a client, by its name, beyond those of its configuration.</summary>
    internal Dictionary<string, Action<IServiceProvider, MqttClientOptionsBuilder>> Configure { get; } = [];

    public IMqttClientHostBuilder AddClient(string name, IConfigurationSection configurationSection)
    {
        if (ClientNames.Contains(name))
        {
            throw new ArgumentException($"Register multiple clients with the same name is not allowed! '{name}'");
        }

        services
            .Configure<MqttConfig>(name, configurationSection)
            .AddKeyedSingleton(name, (provider, _) =>
            {
                var loggerFactory = provider.GetRequiredService<ILoggerFactory>();
                return new MqttClientFactory().CreateManagedMqttClient(new MqttLogger(loggerFactory, name));
            });
        ClientNames.Add(name);
        return this;
    }

    public IMqttClientHostBuilder AddClient(IConfigurationSection configurationSection)
    {
        const string defaultName = "default";
        AddClient(defaultName, configurationSection);
        services.AddSingleton(provider => provider.GetRequiredKeyedService<IManagedMqttClient>(defaultName));
        return this;
    }

    public IMqttClientHostBuilder AddClient(IConfigurationSection configurationSection, Action<IServiceProvider, MqttClientOptionsBuilder> configure)
    {
        ArgumentNullException.ThrowIfNull(configure);
        AddClient(configurationSection);
        Configure["default"] = configure;
        return this;
    }
}
