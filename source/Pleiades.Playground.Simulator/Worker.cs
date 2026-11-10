using Microsoft.Extensions.Options;
using MQTTnet.Extensions.ManagedClient;
using Pleiades.Playground.Events.Generators.NotificationEvent;
using Pleiades.Playground.Timeseries.Generators.BaseUnitValue;
using Pleiades.Playground.Timeseries.Generators.BooleanValue;
using Pleiades.Playground.Timeseries.Generators.StringValue;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Common.Logging.Configuration;

namespace Pleiades.Playground.Simulator;

[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed class Worker : BackgroundService
{
    private readonly Config _config;
    private readonly ILogger<Worker> _logger;
    private readonly IManagedMqttClient _mqttClient;
    private readonly IBaseUnitValueGenerator _baseUnitValueGenerator;
    private readonly IStringValueGenerator _stringValueGenerator;
    private readonly IBooleanValueGenerator _booleanValueGenerator;
    private readonly INotificationEventGenerator _notificationEventGenerator;

    private static readonly Action<ILogger, Exception?> LogStopping = LoggerMessage.Define(LogLevel.Information, 1, "Worker is stopping.");
    private static readonly Action<ILogger, Exception?> LogStarting = LoggerMessage.Define(LogLevel.Information, 0, "Worker is starting.");

    public Worker(
        IOptions<Config> config,
        ILogger<Worker> logger,
        IManagedMqttClient mqttClient,
        IBaseUnitValueGenerator baseUnitValueGenerator,
        IStringValueGenerator stringValueGenerator,
        IBooleanValueGenerator booleanValueGenerator,
        INotificationEventGenerator notificationEventGenerator)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
        _baseUnitValueGenerator = baseUnitValueGenerator ?? throw new ArgumentNullException(nameof(baseUnitValueGenerator));
        _stringValueGenerator = stringValueGenerator ?? throw new ArgumentNullException(nameof(stringValueGenerator));
        _booleanValueGenerator = booleanValueGenerator ?? throw new ArgumentNullException(nameof(booleanValueGenerator));
        _notificationEventGenerator = notificationEventGenerator ?? throw new ArgumentNullException(nameof(notificationEventGenerator));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        LogStarting(_logger, null);

        _logger.LogConfiguration(_config, redactor => redactor
            .Redact(c => c.MqttDestination.ConnectionString, BuiltInRedactors.MqttUri)
            .Redact(c => c.MqttDestination.User, BuiltInRedactors.MaskAll)
            .Redact(c => c.MqttDestination.Password, BuiltInRedactors.MaskAll));


        _baseUnitValueGenerator.StartGeneratingValues(stoppingToken);
        _stringValueGenerator.StartGeneratingValues(stoppingToken);
        _booleanValueGenerator.StartGeneratingValues(stoppingToken);

        try
        {
            // Values and states run in the background; notifications run until the service stops.
            await _notificationEventGenerator.StartGeneratingEvents(stoppingToken).ConfigureAwait(false);
            await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            LogStopping(_logger, null);
        }
        finally
        {
            await _mqttClient.StopAsync().ConfigureAwait(false);
        }
    }
}
