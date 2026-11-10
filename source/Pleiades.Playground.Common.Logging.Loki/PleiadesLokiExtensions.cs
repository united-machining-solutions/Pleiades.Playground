using Microsoft.Extensions.Configuration;
using Serilog;
using Serilog.Events;
using Serilog.Sinks.Grafana.Loki;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Common.Logging.Models;

namespace Pleiades.Playground.Common.Logging.Loki;

public static class PleiadesLokiExtensions
{
    /// <summary>
    /// Configures Serilog to write to Loki using configuration from a specific section.
    /// </summary>
    public static LoggerConfiguration WriteToLoki(
        this LoggerConfiguration loggerConfig,
        IConfiguration configuration,
        ServiceInfo serviceInfo)
    {
        return WriteToLoki(loggerConfig, configuration, serviceInfo, "Loki");
    }

    public static LoggerConfiguration WriteToLoki(
        this LoggerConfiguration loggerConfig,
        IConfiguration configuration,
        ServiceInfo serviceInfo,
        string sectionName)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var section = configuration.GetSection(sectionName);
        return loggerConfig.WriteToLoki(section, serviceInfo);
    }

    /// <summary>
    /// Configures Serilog to write to Loki using a configuration section.
    /// </summary>
    public static LoggerConfiguration WriteToLoki(
        this LoggerConfiguration loggerConfig,
        IConfigurationSection configurationSection,
        ServiceInfo serviceInfo)
    {
        ArgumentNullException.ThrowIfNull(configurationSection);
        var lokiConfig = configurationSection.Get<SerilogLokiConfig>();
        ArgumentNullException.ThrowIfNull(lokiConfig);
        return loggerConfig.WriteToLoki(lokiConfig, serviceInfo);
    }

    /// <summary>
    /// Configures Serilog to write to Loki using a configuration object.
    /// </summary>
    public static LoggerConfiguration WriteToLoki(
        this LoggerConfiguration loggerConfig,
        SerilogLokiConfig lokiConfig,
        ServiceInfo serviceInfo)
    {
        ArgumentNullException.ThrowIfNull(loggerConfig);
        ArgumentNullException.ThrowIfNull(lokiConfig);
        ArgumentNullException.ThrowIfNull(serviceInfo);
        if (lokiConfig.EnableDiagnostics)
        {
            Serilog.Debugging.SelfLog.Enable(msg =>
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"[SERILOG-DIAG] {msg}");
                Console.ResetColor();
            });
        }

        foreach (var sink in lokiConfig.Sinks.Where(s => s.Enabled && s.Uri != null))
        {
            ConfigureLokiSink(loggerConfig, sink, serviceInfo);
        }

        return loggerConfig;
    }

    private static void ConfigureLokiSink(
        LoggerConfiguration config,
        LokiSinkConfig sink,
        ServiceInfo serviceInfo)
    {
        // Build labels
        var labels = new List<LokiLabel>
        {
            new() { Key = "service_name", Value = serviceInfo.Name },
            new() { Key = "version", Value = serviceInfo.Version },
            new() { Key = "service_instance_id", Value = serviceInfo.InstanceId },
            new() { Key = "environment", Value = serviceInfo.Environment }
        };

        // Add custom labels from config
        if (sink.Labels != null)
        {
            labels.AddRange(sink.Labels.Select(kvp => new LokiLabel
            {
                Key = kvp.Key,
                Value = kvp.Value
            }));
        }

        // Configure credentials
        LokiCredentials? credentials = null;
        if (sink.BasicAuth != null &&
            !string.IsNullOrEmpty(sink.BasicAuth.Username) &&
            !string.IsNullOrEmpty(sink.BasicAuth.Password))
        {
            credentials = new LokiCredentials
            {
                Login = sink.BasicAuth.Username,
                Password = sink.BasicAuth.Password
            };
        }

        // Configure sink with optional minimum level
        if (!string.IsNullOrEmpty(sink.MinimumLevel) &&
            Enum.TryParse<LogEventLevel>(sink.MinimumLevel, out var minLevel))
        {
            config.WriteTo.Logger(lc => lc
                .MinimumLevel.Is(minLevel)
                .WriteTo.GrafanaLoki(
                    sink.Uri.ToString(),
                    [.. labels],
                    credentials: credentials,
                    queueLimit: sink.QueueLimit,
                    batchSizeLimit: sink.BatchPostingLimit ?? 1000,
                    period: sink.Period));
        }
        else
        {
            config.WriteTo.GrafanaLoki(
                sink.Uri.ToString(),
                [.. labels],
                credentials: credentials,
                queueLimit: sink.QueueLimit,
                batchSizeLimit: sink.BatchPostingLimit ?? 1000,
                period: sink.Period);
        }
    }
}
