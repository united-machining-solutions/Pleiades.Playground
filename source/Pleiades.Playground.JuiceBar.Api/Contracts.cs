using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// An ingredient of a drink. <paramref name="Color"/> is the colour the marketplace shows it in, as <c>#rrggbb</c>.
/// <paramref name="RunsLow"/> says that the bottle of its pump warns; null while the warnings are not known.
/// </summary>
internal sealed record DrinkComponent(string Id, string? Name, string? Color = null, bool? RunsLow = null);

/// <summary>
/// A drink of the card. <paramref name="Color"/> and <paramref name="Picture"/> are what its author chose in the
/// marketplace: a colour as <c>#rrggbb</c>, and the picture of a glass, named by the id its drawing gives it.
/// </summary>
internal sealed record Drink(string Id, string Title, string? Description, IReadOnlyList<DrinkComponent> Components,
    string? Color = null, string? Picture = null);

/// <summary>One pump of the machine. The bottle volume is the configured size of a full bottle, not a level.</summary>
internal sealed record Pump(int Number, string? ComponentId, string? ComponentName, double? BottleVolumeCubicMetre,
    bool? AmountWarning);

internal sealed record QueuedOrder(int OrderNumber, string? OrderName, string? DrinkId, int QueuePlace);

internal sealed record JuiceBarStatus(bool Connected, string? ProductionState, string? PumpControlMode,
    string? PumpControlServiceState, double? ProgressFraction, IReadOnlyList<QueuedOrder> Queue,
    IReadOnlyList<Pump> Pumps, bool OrderingEnabled, int MaximumQueueLength, DateTimeOffset ObservedAt);

/// <summary>
/// One ingredient on the pumps of the machine, and in how many sold drinks it was by the report of the marketplace:
/// in the last <see cref="Consumption.Hours"/> and since the start. A count is null where the report does not say it:
/// the ingredient has no name, or it is not among the lines of a report that is full or has a line that could not be
/// read. <paramref name="Pumps"/> are the numbers of the pumps it is on, <paramref name="RunsLow"/> whether the bottle of
/// one of them warns; null while the warnings are not known.
/// </summary>
internal sealed record IngredientUse(string ComponentId, string? Name, string? Color, IReadOnlyList<int> Pumps,
    int? DrinksInHours, int? DrinksSinceStart, bool? RunsLow);

/// <summary>
/// How the ingredients on the pumps were used, the most used since the start first. <paramref name="LeastUsedId"/> is the
/// one in the fewest drinks since the start, fewer in the last hours deciding a tie; null when there is no ingredient
/// or the count of one is not known. <paramref name="Summary"/> says it in a few words, <paramref name="Source"/> where
/// the counts come from.
/// </summary>
internal sealed record Consumption(DateTimeOffset From, DateTimeOffset To, int Hours, IReadOnlyList<IngredientUse> Ingredients,
    string? LeastUsedId, string Summary, string Source);

internal sealed record OrderRequest(string DrinkId);

internal sealed record Order(int OrderNumber, string? OrderName, string? DrinkId, string? State,
    double? ProgressFraction, int? QueuePlace, string? ErrorMessage, string? NextStep = null);

internal sealed class JuiceBarOptions
{
    /// <summary>Address of the MixerControl web server of the machine.</summary>
    public string BaseUrl { get; set; } = "http://juicebar.local:3000/";

    /// <summary>Whether this service places orders. Reading works either way.</summary>
    public bool EnableOrdering { get; set; } = true;

    /// <summary>An order is refused while this many orders wait at the machine.</summary>
    public int MaximumQueueLength { get; set; } = 3;

    /// <summary>
    /// The web address of the manufacturer, <c>Identification/ManufacturerUri</c>. Its domain without the top-level
    /// domain is the first part of the machine id, and with it the prefix of the signals of the manufacturer.
    /// </summary>
    public string ManufacturerUri { get; set; } = "https://www.trumpf.com";

    /// <summary>The name of the manufacturer, as <c>Identification/Manufacturer</c> says it.</summary>
    public string ManufacturerName { get; set; } = "TRUMPF";

    /// <summary>The model of the machine, the second part of the machine id.</summary>
    public string Model { get; set; } = "JuiceBar";

    /// <summary>The serial number of the machine, the third part of the machine id.</summary>
    public string SerialNumber { get; set; } = "JUICEBAR-01";

    /// <summary>The globally unique id of the machine; empty for <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>.</summary>
    public string ProductInstanceUri { get; set; } = string.Empty;

    /// <summary>Who the machine is, by the rules of the MQTT binding.</summary>
    public MachineIdentity Identity => new(ManufacturerName, ManufacturerUri, Model, SerialNumber, ProductInstanceUri);

    /// <summary>The machine id of the MQTT binding, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>.</summary>
    public string MachineId => Identity.MachineId;

    /// <summary>Language of the names the machine returns: <c>en</c> or <c>de</c>.</summary>
    public string Language { get; set; } = "en";

    /// <summary>
    /// Address of the website of the marketplace the machine takes its recipes from. Its public report says how often
    /// each ingredient went into a sold drink. Empty: the use of the ingredients is not read.
    /// </summary>
    public string MarketplaceUrl { get; set; } = string.Empty;
}

/// <summary>The machine did not answer, or answered with something this service does not understand.</summary>
internal sealed class JuiceBarUnavailableException : Exception
{
    public JuiceBarUnavailableException()
    {
    }

    public JuiceBarUnavailableException(string message)
        : base(message)
    {
    }

    public JuiceBarUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
