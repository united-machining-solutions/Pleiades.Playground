using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator;

/// <summary>
/// Configuration of the simulator. One instance simulates one machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>
    /// Serial number of the simulated machine, <c>Identification.SerialNumber</c> and the last part of the machine id
    /// in every topic, <c>machines/{MachineId}/...</c>. Must not contain '/', '+' or '#'.
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
    /// The virtual machine and what it publishes after the data model, below <c>machines/{MachineId}/</c>: its
    /// manufacturer and its scenario.
    /// </summary>
    public SpecOutputConfig SpecOutput { get; init; } = new();

    /// <summary>
    /// Loki logging configuration.
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
