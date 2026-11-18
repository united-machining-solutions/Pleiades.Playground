namespace Pleiades.Playground.JuiceBar.Api;

internal sealed record DrinkComponent(string Id, string? Name);

internal sealed record Drink(string Id, string Title, string? Description, IReadOnlyList<DrinkComponent> Components);

/// <summary>One pump of the machine. The bottle volume is the configured size of a full bottle, not a level.</summary>
internal sealed record Pump(int Number, string? ComponentId, string? ComponentName, double? BottleVolumeCubicMetre,
    bool? AmountWarning);

internal sealed record QueuedOrder(int OrderNumber, string? OrderName, string? DrinkId, int QueuePlace);

internal sealed record JuiceBarStatus(bool Connected, string? ProductionState, string? PumpControlMode,
    string? PumpControlServiceState, double? ProgressFraction, IReadOnlyList<QueuedOrder> Queue,
    IReadOnlyList<Pump> Pumps, bool OrderingEnabled, int MaximumQueueLength, DateTimeOffset ObservedAt);

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

    /// <summary>The machine id in every MQTT topic.</summary>
    public string SerialNumber { get; set; } = "JUICEBAR-01";

    /// <summary>Language of the names the machine returns: <c>en</c> or <c>de</c>.</summary>
    public string Language { get; set; } = "en";
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
