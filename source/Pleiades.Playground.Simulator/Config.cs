using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Events.Generators.NotificationEvent;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Timeseries.Generators.BaseUnitValue;
using Pleiades.Playground.Timeseries.Generators.BooleanValue;
using Pleiades.Playground.Timeseries.Generators.StringValue;

namespace Pleiades.Playground.Simulator;

/// <summary>
/// Configuration of the simulator. One instance simulates one machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>
    /// Serial number of the simulated machine. It is the machine id in every topic:
    /// <c>machines/{SerialNumber}/...</c>. Must not contain '/', '+' or '#'.
    /// </summary>
    [Required]
    [RegularExpression(@"^[^/+#\s]+$")]
    public required string SerialNumber { get; init; }

    /// <summary>
    /// MQTT broker the simulator publishes to.
    /// </summary>
    [Required]
    public required MqttConfig MqttDestination { get; set; }

    /// <summary>
    /// Numeric values, each in its SI unit.
    /// </summary>
    [Required]
    public required BaseUnitValueGeneratorConfig BaseUnitValueGeneratorConfig { get; init; }

    /// <summary>
    /// Text values such as machine states.
    /// </summary>
    [Required]
    public required StringValueGeneratorConfig StringValueGeneratorConfig { get; init; }

    /// <summary>
    /// Boolean values.
    /// </summary>
    [Required]
    public required BooleanValueGeneratorConfig BooleanValueGeneratorConfig { get; init; }

    /// <summary>
    /// Notifications (alarms and messages) that are raised and reset.
    /// </summary>
    [Required]
    public required NotificationEventGeneratorConfig NotificationEventGeneratorConfig { get; init; }

    /// <summary>
    /// Loki logging configuration.
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
