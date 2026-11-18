using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// The units a number goes out with: the names of the catalogue of the data model, which the binding sends as
/// they are (<c>contracts/mqtt</c>, "Units"). An element of the model has the one unit its catalogue gives, energy
/// in <c>wattHour</c>; a signal of the maker takes one of the names here, which the manifest names with its code.
/// </summary>
internal static class CatalogueUnits
{
    /// <summary>The units a signal of the maker may have, by name, with the code of UN/ECE the manifest names.</summary>
    public static readonly IReadOnlyDictionary<string, MachineUnit> Known = new Dictionary<string, MachineUnit>(StringComparer.Ordinal)
    {
        ["one"] = MachineUnit.One,
        ["second"] = MachineUnit.Second,
        ["piece"] = new("H87", "piece"),
        ["metre"] = MachineUnit.Metre,
        ["kilogram"] = new("KGM", "kilogram"),
        ["watt"] = new("WTT", "watt"),
        ["wattHour"] = new("WHR", "wattHour"),
        ["volt"] = new("VLT", "volt"),
        ["ampere"] = new("AMP", "ampere"),
        ["hertz"] = new("HTZ", "hertz"),
        ["pascal"] = new("PAL", "pascal"),
        ["newton"] = new("NEW", "newton"),
        ["degreeCelsius"] = MachineUnit.DegreeCelsius,
        ["metrePerSecond"] = new("MTS", "metrePerSecond"),
    };

    /// <summary>
    /// The unit of each number of the model the adapter knows, after the catalogue of 0.17.1, by the path below
    /// an instance where the element has instances. A number of the model that is not here has no unit, such as
    /// <c>Identification.YearOfConstruction</c>.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> OfModel = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["State.FeedOverride"] = "one",
        ["OperationCounters.PowerOnDuration"] = "second",
        ["OperationCounters.OperationDuration"] = "second",
        ["OperationCounters.PartsProducedInLifetime"] = "piece",
        ["Channel.FeedOverride"] = "one",
        ["Channel.RapidOverride"] = "one",
        ["Spindle.Override"] = "one",
        ["Consumption.Electricity.AcActivePowerTotal"] = "watt",
        ["Consumption.Electricity.AcActiveEnergyTotalImportHp"] = "wattHour",
    };

    /// <summary>The numbers of the model that carry no unit: a year and a month.</summary>
    public static readonly IReadOnlySet<string> WithoutUnit = new HashSet<string>(StringComparer.Ordinal)
    {
        "Identification.YearOfConstruction", "Identification.MonthOfConstruction",
    };

    /// <summary>
    /// The unit the catalogue gives an element of the model on the path of a registration, or null where the
    /// adapter knows none. <c>Channel[1].FeedOverride</c> is looked up as <c>Channel.FeedOverride</c>.
    /// </summary>
    public static string? Of(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        var open = path.IndexOf('[', StringComparison.Ordinal);
        var close = path.IndexOf("].", StringComparison.Ordinal);
        var key = open > 0 && close > open ? path[..open] + path[(close + 1)..] : path;
        return OfModel.TryGetValue(key, out var unit) ? unit : null;
    }

    /// <summary>Whether <paramref name="name"/> is a unit a number may go out with.</summary>
    public static bool IsKnown(string? name) => name is not null && Known.ContainsKey(name);
}
