using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using Serilog.Events;
using Pleiades.Playground.Common.Logging.Models;

namespace Pleiades.Playground.Common.Logging;

public static class PleiadesLoggingExtensions
{
    /// <summary>
    /// Configures Serilog with Pleiades defaults.
    /// Includes:
    /// - Configuration reading (appsettings.json)
    /// - Console logging (standardized format)
    /// - Service context enrichment
    /// - Extension point for additional sinks (e.g. Loki)
    /// </summary>
    /// <param name="builder">The host builder.</param>
    /// <param name="serviceInfo">Service identity information.</param>
    /// <param name="configure">Optional delegate to configure additional Serilog settings.</param>
    /// <returns>The host builder.</returns>
    public static IHostBuilder UsePleiadesLogging(
        this IHostBuilder builder,
        ServiceInfo serviceInfo)
    {
        return UsePleiadesLogging(builder, serviceInfo, null);
    }

    public static IHostBuilder UsePleiadesLogging(
        this IHostBuilder builder,
        ServiceInfo serviceInfo,
        Action<LoggerConfiguration, IConfiguration>? configure)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(serviceInfo);

        return builder.UseSerilog((context, config) =>
        {
            // 1. Sensible defaults (can be overridden via appsettings.json Serilog:MinimumLevel:Override)
            config.MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning);
            config.MinimumLevel.Override("Polly", LogEventLevel.Warning);

            // 2. Configuration (merges with and can override the defaults above)
            config.ReadFrom.Configuration(context.Configuration);
            config.Enrich.FromLogContext();
            config.Enrich.WithProperty("ServiceName", serviceInfo.Name);
            config.Enrich.WithProperty("ServiceVersion", serviceInfo.Version);
            config.Enrich.WithProperty("ServiceInstanceId", serviceInfo.InstanceId);
            config.Enrich.WithProperty("Environment", serviceInfo.Environment);

            // 3. Console (Always active, standardized format)
            config.WriteTo.Console(
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
                formatProvider: CultureInfo.InvariantCulture);

            // 4. Extension Point (for Loki or other sinks)
            configure?.Invoke(config, context.Configuration);
        });
    }

    /// <summary>
    /// Configures Serilog with Pleiades defaults for HostApplicationBuilder.
    /// Includes:
    /// - Configuration reading (appsettings.json)
    /// - Console logging (standardized format)
    /// - Service context enrichment
    /// - Extension point for additional sinks (e.g. Loki)
    /// </summary>
    /// <param name="builder">The host application builder.</param>
    /// <param name="serviceInfo">Service identity information.</param>
    /// <returns>The host application builder.</returns>
    public static IHostApplicationBuilder UsePleiadesLogging(
        this IHostApplicationBuilder builder,
        ServiceInfo serviceInfo)
    {
        return UsePleiadesLogging(builder, serviceInfo, null);
    }

    /// <summary>
    /// Configures Serilog with Pleiades defaults for HostApplicationBuilder.
    /// Includes:
    /// - Configuration reading (appsettings.json)
    /// - Console logging (standardized format)
    /// - Service context enrichment
    /// - Extension point for additional sinks (e.g. Loki)
    /// </summary>
    /// <param name="builder">The host application builder.</param>
    /// <param name="serviceInfo">Service identity information.</param>
    /// <param name="configure">Optional delegate to configure additional Serilog settings.</param>
    /// <returns>The host application builder.</returns>
    public static IHostApplicationBuilder UsePleiadesLogging(
        this IHostApplicationBuilder builder,
        ServiceInfo serviceInfo,
        Action<LoggerConfiguration, IConfiguration>? configure)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(serviceInfo);

        _ = builder.Services.AddSerilog((sp, loggerConfig) =>
        {
            var config = sp.GetRequiredService<IConfiguration>();

            // 1. Sensible defaults (can be overridden via appsettings.json Serilog:MinimumLevel:Override)
            loggerConfig.MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning);
            loggerConfig.MinimumLevel.Override("Polly", LogEventLevel.Warning);

            // 2. Configuration (merges with and can override the defaults above)
            loggerConfig.ReadFrom.Configuration(config);
            loggerConfig.Enrich.FromLogContext();
            loggerConfig.Enrich.WithProperty("ServiceName", serviceInfo.Name);
            loggerConfig.Enrich.WithProperty("ServiceVersion", serviceInfo.Version);
            loggerConfig.Enrich.WithProperty("ServiceInstanceId", serviceInfo.InstanceId);
            loggerConfig.Enrich.WithProperty("Environment", serviceInfo.Environment);

            // 3. Console (Always active, standardized format)
            loggerConfig.WriteTo.Console(
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}",
                formatProvider: CultureInfo.InvariantCulture);

            // 4. Extension Point (for Loki or other sinks)
            configure?.Invoke(loggerConfig, config);
        });

        return builder;
    }
}
