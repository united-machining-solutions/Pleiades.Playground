using System.Reflection;
using Microsoft.Extensions.Configuration;
using Pleiades.Playground.Common.Logging.Models;

namespace Pleiades.Playground.Common.Logging;

public static class ServiceInfoExtensions
{
    public static ServiceInfo CreateServiceInfo(this Assembly assembly)
    {
        return CreateServiceInfo(assembly, "Production");
    }

    public static ServiceInfo CreateServiceInfo(this Assembly assembly, string environment)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        var assemblyName = assembly.GetName();
        return new ServiceInfo(
            Name: assemblyName.Name ?? "Unknown",
            Version: assemblyName.Version?.ToString() ?? "0.0.0",
            InstanceId: Guid.NewGuid().ToString(),
            Environment: environment
        );
    }

    /// <summary>
    /// Overrides ServiceInfo properties using configuration settings.
    /// </summary>
    /// <param name="serviceInfo">The ServiceInfo instance to configure.</param>
    /// <param name="configuration">The configuration source.</param>
    /// <returns>The configured ServiceInfo object.</returns>
    public static ServiceInfo UseConfiguration(this ServiceInfo serviceInfo, IConfiguration configuration)
    {
        return UseConfiguration(serviceInfo, configuration, "ServiceInfo");
    }

    /// <summary>
    /// Overrides ServiceInfo properties using configuration settings.
    /// </summary>
    /// <param name="serviceInfo">The ServiceInfo instance to configure.</param>
    /// <param name="configuration">The configuration source.</param>
    /// <param name="sectionName">The configuration section name.</param>
    /// <returns>The configured ServiceInfo object.</returns>
    public static ServiceInfo UseConfiguration(this ServiceInfo serviceInfo, IConfiguration configuration, string sectionName)
    {
        ArgumentNullException.ThrowIfNull(serviceInfo);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentException.ThrowIfNullOrWhiteSpace(sectionName);

        var section = configuration.GetSection(sectionName);
        
        // Since ServiceInfo is a record, we create a new instance with updated values if present in config
        var name = section["Name"] ?? serviceInfo.Name;
        var version = section["Version"] ?? serviceInfo.Version;
        var instanceId = section["InstanceId"] ?? serviceInfo.InstanceId;
        var environment = section["Environment"] ?? serviceInfo.Environment;

        return new ServiceInfo(name, version, instanceId, environment);
    }
}
