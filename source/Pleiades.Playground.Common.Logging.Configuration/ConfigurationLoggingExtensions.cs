using Microsoft.Extensions.Logging;

namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Extension methods for logging redacted configuration snapshots.
/// </summary>
public static partial class ConfigurationLoggingExtensions
{
    private const string ConfigMessage = "Configuration: {ConfigJson}";

    private static readonly Func<ILogger, string, IDisposable?> ConfigurationScope =
        LoggerMessage.DefineScope<string>("{ConfigurationScope}");

    [LoggerMessage(Message = ConfigMessage)]
#pragma warning disable SYSLIB1015 // Argument 'eventId' is not referenced in the logging message
    private static partial void LogConfigSnapshot(ILogger logger, LogLevel level, EventId eventId, string configJson);
#pragma warning restore SYSLIB1015

    /// <summary>
    /// Logs a redacted snapshot of the configuration.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Usage Example:</b>
    /// <code>
    /// logger.LogConfiguration(
    ///     config,
    ///     redactor => redactor
    ///         .Redact(c => c.ApiToken, BuiltInRedactors.MaskAll)
    ///         .RedactEach(c => c.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll),
    ///     level: LogLevel.Information);
    /// </code>
    /// </para>
    /// <para>
    /// The configure delegate receives a fresh ConfigurationRedactor and must return
    /// a configured instance (immutable builder pattern).
    /// </para>
    /// </remarks>
    /// <typeparam name="TConfig">The configuration type</typeparam>
    /// <param name="logger">The logger instance</param>
    /// <param name="config">The configuration to log</param>
    public static void LogConfiguration<TConfig>(
        this ILogger logger,
        TConfig config)
    {
        LogConfiguration(logger, config, null, LogLevel.Information, 1000, null);
    }

    /// <summary>
    /// Logs a redacted snapshot of the configuration.
    /// </summary>
    /// <typeparam name="TConfig">The configuration type</typeparam>
    /// <param name="logger">The logger instance</param>
    /// <param name="config">The configuration to log</param>
    /// <param name="configure">Delegate to configure redaction rules.</param>
    public static void LogConfiguration<TConfig>(
        this ILogger logger,
        TConfig config,
        Func<ConfigurationRedactor<TConfig>, ConfigurationRedactor<TConfig>>? configure)
    {
        LogConfiguration(logger, config, configure, LogLevel.Information, 1000, null);
    }

    public static void LogConfiguration<TConfig>(
        this ILogger logger,
        TConfig config,
        Func<ConfigurationRedactor<TConfig>, ConfigurationRedactor<TConfig>>? configure,
        LogLevel level)
    {
        LogConfiguration(logger, config, configure, level, 1000, null);
    }

    public static void LogConfiguration<TConfig>(
        this ILogger logger,
        TConfig config,
        Func<ConfigurationRedactor<TConfig>, ConfigurationRedactor<TConfig>>? configure,
        LogLevel level,
        int eventId)
    {
        LogConfiguration(logger, config, configure, level, eventId, null);
    }

    public static void LogConfiguration<TConfig>(
        this ILogger logger,
        TConfig config,
        Func<ConfigurationRedactor<TConfig>, ConfigurationRedactor<TConfig>>? configure,
        LogLevel level,
        int eventId,
        string? scopeName)
    {
        ArgumentNullException.ThrowIfNull(logger);
        ArgumentNullException.ThrowIfNull(config);

        if (!logger.IsEnabled(level))
        {
            return;
        }

        var redactor = new ConfigurationRedactor<TConfig>();

        if (configure is not null)
        {
            redactor = configure(redactor);
        }

        var json = redactor.SerializeAndRedact(config);
        var evtId = new EventId(eventId, "ConfigurationSnapshot");

        if (!string.IsNullOrEmpty(scopeName))
        {
            using (ConfigurationScope(logger, scopeName))
            {
                LogConfigSnapshot(logger, level, evtId, json);
            }
        }
        else
        {
            LogConfigSnapshot(logger, level, evtId, json);
        }
    }
}
