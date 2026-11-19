using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Bend.Protocol.Transport;

namespace Pleiades.Playground.Bend.Simulator;

/// <summary>
/// Configuration of the simulator, from the section <c>Config</c> (environment: <c>Config__SerialNumber</c> and so
/// on). One instance simulates one machine. Serial number, manufacturer, model, exchange folder and file name are
/// those of the adapter of the machine; the web page shows them read only.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>
    /// The serial number of the machine, as its adapter publishes it; the simulator only shows it, the telegrams do
    /// not carry it. Must not contain '/', '+' or '#'.
    /// </summary>
    [RegularExpression(@"^[^/+#\s]*$")]
    public string SerialNumber { get; init; } = string.Empty;

    /// <summary>The manufacturer of the machine.</summary>
    public string Manufacturer { get; init; } = "Manufacturer_A";

    /// <summary>The web address of the manufacturer, as its adapter publishes it; gives the ProductInstanceUri.</summary>
    public string ManufacturerUri { get; init; } = "https://www.trumpf.com";

    /// <summary>The model of the machine, for example <c>Bend5130</c>. Optional.</summary>
    public string Model { get; init; } = string.Empty;

    /// <summary>The globally unique id of the machine, as its adapter publishes it; empty for <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>.</summary>
    public string ProductInstanceUri { get; init; } = string.Empty;

    /// <summary>The folder with the telegram files, shared with the host.</summary>
    [Required]
    public string ExchangeDirectory { get; init; } = "/exchange";

    /// <summary>
    /// What the exchange folder is mounted from, a host path or a volume, for the web page only. Empty: the page
    /// shows <see cref="ExchangeDirectory"/>.
    /// </summary>
    public string ExchangeDirectorySource { get; init; } = string.Empty;

    /// <summary>The name of the telegram files the machine writes, without the running number and <c>.xml</c>.</summary>
    [Required]
    [RegularExpression(@"^[A-Za-z0-9_.-]+$")]
    public string MachineFilePrefix { get; init; } = RciChannelOptions.DefaultMachineFilePrefix;

    /// <summary>The pause between two part feedbacks of the automatic processing.</summary>
    [Range(typeof(TimeSpan), "00:00:00", "00:10:00")]
    public TimeSpan PartFeedbackInterval { get; init; } = TimeSpan.FromSeconds(2);

    /// <summary>
    /// How long the machine stands idle between two positions of a package processed as a whole, so a host sees
    /// the change of the position.
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:00", "00:10:00")]
    public TimeSpan PositionChangeInterval { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>Where the simulator keeps the production plan across restarts. Empty: nowhere.</summary>
    public string StatePath { get; init; } = "/data/state.json";

    /// <summary>Fill an empty plan with a few demo packages on the first start.</summary>
    public bool SeedDemoOrders { get; init; } = true;
}
