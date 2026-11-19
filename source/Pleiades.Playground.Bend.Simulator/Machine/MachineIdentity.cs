namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>
/// The identity of the simulated machine, read only from the configuration. The ProductInstanceUri is the one the
/// adapter publishes as <c>Identification.ProductInstanceUri</c>: the configured one, or
/// <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>, for example <c>https://www.pfenibru.example/L76/987654321</c>.
/// </summary>
internal sealed record MachineIdentity(string Manufacturer, string ManufacturerUri, string Model, string SerialNumber, string ConfiguredProductInstanceUri)
{
    public string ProductInstanceUri => string.IsNullOrWhiteSpace(ConfiguredProductInstanceUri)
        ? $"{ManufacturerUri.TrimEnd('/')}/{Uri.EscapeDataString(Model)}/{Uri.EscapeDataString(SerialNumber)}"
        : ConfiguredProductInstanceUri;

    public static MachineIdentity From(Config config)
    {
        ArgumentNullException.ThrowIfNull(config);
        return new MachineIdentity(
            (config.Manufacturer ?? string.Empty).Trim(),
            (config.ManufacturerUri ?? string.Empty).Trim(),
            (config.Model ?? string.Empty).Trim(),
            (config.SerialNumber ?? string.Empty).Trim(),
            (config.ProductInstanceUri ?? string.Empty).Trim());
    }
}
