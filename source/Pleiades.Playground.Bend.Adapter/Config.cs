using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Bend.Protocol.Transport;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Bend.Adapter;

/// <summary>
/// Configuration of the adapter, from the section <c>Config</c>. One adapter reads one machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>
    /// The serial number of the machine, <c>Identification.SerialNumber</c>, the last part of the machine id
    /// <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>. The telegrams do not carry it.
    /// </summary>
    [Required]
    public required string SerialNumber { get; init; }

    /// <summary>The name of the manufacturer, <c>Identification.Manufacturer</c>.</summary>
    [Required]
    public string Manufacturer { get; init; } = "TRUMPF";

    /// <summary>
    /// The web address of the manufacturer, <c>Identification.ManufacturerUri</c>. Its domain without <c>www.</c>
    /// and its ending is the first part of the machine id, and with dashes the prefix of its signals
    /// (<c>x-trumpf-com</c>).
    /// </summary>
    [Required]
    [Url]
    public string ManufacturerUri { get; init; } = "https://www.trumpf.com";

    /// <summary>The model, <c>Identification.Model</c>, the middle part of the machine id.</summary>
    [Required]
    public string Model { get; init; } = "Bend5130";

    /// <summary>The globally unique id of the machine; empty for <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>.</summary>
    [MaxLength(255)]
    public string ProductInstanceUri { get; init; } = string.Empty;

    /// <summary>Who the machine is, as the binding names it.</summary>
    public MachineIdentity Identity => new(Manufacturer, ManufacturerUri, Model, SerialNumber, ProductInstanceUri);

    /// <summary>
    /// The folder with the telegram files, shared with the machine. The adapter only reads it: it neither deletes
    /// nor moves a file, so a host such as Oseon can read the same folder.
    /// </summary>
    [Required]
    public string ExchangeDirectory { get; init; } = "/exchange";

    /// <summary>The name of the telegram files of the machine, without the running number and <c>.xml</c>.</summary>
    [Required]
    [RegularExpression(@"^[A-Za-z0-9_.-]+$")]
    public string MachineFilePrefix { get; init; } = RciChannelOptions.DefaultMachineFilePrefix;

    /// <summary>How often the adapter looks for new telegram files.</summary>
    [Range(typeof(TimeSpan), "00:00:00.010", "00:01:00")]
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(1);

    /// <summary>How often the adapter publishes its own <c>Connection/Heartbeat</c>; the manifest names it.</summary>
    [Range(typeof(TimeSpan), "00:00:01", "00:10:00")]
    public TimeSpan HeartbeatInterval { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>
    /// The time zone of the machine. The timestamps of the telegrams carry none; the adapter reads them in this
    /// zone and publishes UTC. Empty: the time zone of the adapter.
    /// </summary>
    public string MachineTimeZone { get; init; } = string.Empty;

    /// <summary>The MQTT broker the adapter publishes to.</summary>
    [Required]
    public required MqttConfig MqttDestination { get; init; }
}
