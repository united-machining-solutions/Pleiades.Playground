using System.Globalization;
using Microsoft.Extensions.Logging;
using MQTTnet.Diagnostics;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Implements logging wrapper for MqttNet clients
/// </summary>
public class MqttLogger : IMqttNetLogger
{
    private static readonly Action<ILogger, string, string, Exception?> _logVerbose =
        LoggerMessage.Define<string, string>(
            LogLevel.Debug,
            new EventId(1, nameof(MqttNetLogLevel.Verbose)),
            "{Source}: {Message}");

    private static readonly Action<ILogger, string, string, Exception?> _logInfo =
        LoggerMessage.Define<string, string>(
            LogLevel.Information,
            new EventId(2, nameof(MqttNetLogLevel.Info)),
            "{Source}: {Message}");

    private static readonly Action<ILogger, string, string, Exception?> _logWarning =
        LoggerMessage.Define<string, string>(
            LogLevel.Warning,
            new EventId(3, nameof(MqttNetLogLevel.Warning)),
            "{Source}: {Message}");

    private static readonly Action<ILogger, string, string, Exception?> _logError =
        LoggerMessage.Define<string, string>(
            LogLevel.Error,
            new EventId(4, nameof(MqttNetLogLevel.Error)),
            "{Source}: {Message}");

    // Named variants: keep Source untouched and expose ClientName as a separate structured property.
    private const string NamedTemplate = "{Source} {ClientName}: {Message}";

    private static readonly Action<ILogger, string, string, string, Exception?> _logVerboseNamed =
        LoggerMessage.Define<string, string, string>(
            LogLevel.Debug,
            new EventId(1, nameof(MqttNetLogLevel.Verbose)),
            NamedTemplate);

    private static readonly Action<ILogger, string, string, string, Exception?> _logInfoNamed =
        LoggerMessage.Define<string, string, string>(
            LogLevel.Information,
            new EventId(2, nameof(MqttNetLogLevel.Info)),
            NamedTemplate);

    private static readonly Action<ILogger, string, string, string, Exception?> _logWarningNamed =
        LoggerMessage.Define<string, string, string>(
            LogLevel.Warning,
            new EventId(3, nameof(MqttNetLogLevel.Warning)),
            NamedTemplate);

    private static readonly Action<ILogger, string, string, string, Exception?> _logErrorNamed =
        LoggerMessage.Define<string, string, string>(
            LogLevel.Error,
            new EventId(4, nameof(MqttNetLogLevel.Error)),
            NamedTemplate);

    private readonly ILogger _logger;
    private readonly string? _name;

    /// <see cref="IMqttNetLogger"/>
    public bool IsEnabled => true;

    /// <summary>
    /// Creates logger with default template
    /// </summary>
    public MqttLogger(ILoggerFactory loggerFactory) : this(loggerFactory, null) { }

    /// <summary>
    /// Creates logger with named template. The <paramref name="name"/> is rendered into the log
    /// message and emitted as a structured <c>ClientName</c> property to allow filtering per client.
    /// </summary>
    public MqttLogger(ILoggerFactory loggerFactory, string? name)
    {
        _ = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _logger = loggerFactory.CreateLogger("Mqtt");
        _name = name;
    }

    /// <see cref="IMqttNetLogger"/>
    public void Publish(MqttNetLogLevel logLevel, string source, string message, object[] parameters, Exception exception)
    {
        var msg = parameters is null ? message : string.Format(CultureInfo.CurrentCulture, message, parameters);
        if (_name is null)
        {
            switch (logLevel)
            {
                case MqttNetLogLevel.Verbose:
                    _logVerbose(_logger, source, msg, exception);
                    break;

                case MqttNetLogLevel.Info:
                    _logInfo(_logger, source, msg, exception);
                    break;

                case MqttNetLogLevel.Warning:
                    _logWarning(_logger, source, msg, exception);
                    break;

                case MqttNetLogLevel.Error:
                    _logError(_logger, source, msg, exception);
                    break;
            }
        }
        else
        {
            switch (logLevel)
            {
                case MqttNetLogLevel.Verbose:
                    _logVerboseNamed(_logger, source, _name, msg, exception);
                    break;

                case MqttNetLogLevel.Info:
                    _logInfoNamed(_logger, source, _name, msg, exception);
                    break;

                case MqttNetLogLevel.Warning:
                    _logWarningNamed(_logger, source, _name, msg, exception);
                    break;

                case MqttNetLogLevel.Error:
                    _logErrorNamed(_logger, source, _name, msg, exception);
                    break;
            }
        }
    }
}
