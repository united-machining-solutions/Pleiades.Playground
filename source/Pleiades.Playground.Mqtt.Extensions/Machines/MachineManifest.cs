// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;

// The URIs of the model are texts on the wire: they are kept as the configuration and the model give them.
#pragma warning disable CA1054, CA1056

namespace Pleiades.Playground.Mqtt.Extensions.Machines;

/// <summary>
/// Who a machine is, as an adapter of the binding knows it from its configuration: the values of
/// <c>Identification</c> every adapter delivers, and what follows from them by the rules of the binding, the machine
/// id, the <c>ProductInstanceUri</c> and the prefix of the signals of the manufacturer.
/// </summary>
/// <param name="Manufacturer">The name of the manufacturer, <c>Identification.Manufacturer</c>.</param>
/// <param name="ManufacturerUri">The web address of the manufacturer, <c>Identification.ManufacturerUri</c>.</param>
/// <param name="Model">The model, <c>Identification.Model</c>.</param>
/// <param name="SerialNumber">The serial number, <c>Identification.SerialNumber</c>.</param>
/// <param name="ProductInstanceUri">The globally unique id of the machine; empty for <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>.</param>
public sealed record MachineIdentity(string Manufacturer, string ManufacturerUri, string Model, string SerialNumber, string? ProductInstanceUri = null)
{
    /// <summary>The machine id of the binding, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>, a level of every topic.</summary>
    public string MachineId => MachineBinding.MachineId(ManufacturerUri, Model, SerialNumber);

    /// <summary>The value of <c>Identification.ProductInstanceUri</c>, as the simulators form it unless it is set.</summary>
    public string EffectiveProductInstanceUri => string.IsNullOrWhiteSpace(ProductInstanceUri)
        ? $"{ManufacturerUri.TrimEnd('/')}/{Uri.EscapeDataString(Model)}/{Uri.EscapeDataString(SerialNumber)}"
        : ProductInstanceUri;

    /// <summary>The prefix segment of the signals of the manufacturer, <c>x-&lt;domain&gt;</c>.</summary>
    public string ExtensionPrefix => MachineBinding.ExtensionPrefix(MachineBinding.DomainOf(ManufacturerUri));

    /// <summary>The path of a signal of the manufacturer: the prefix, a dot and the path below it.</summary>
    public string Signal(string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(relativePath);
        return $"{ExtensionPrefix}.{relativePath}";
    }

    /// <summary>The values of <c>Identification</c> the identity knows, at <paramref name="timestamp"/>.</summary>
    public IReadOnlyList<MachineValue> Values(DateTimeOffset timestamp)
    {
        return
        [
            new(MachineManifest.Manufacturer, JsonValue.Create(Manufacturer), timestamp),
            new(MachineManifest.SerialNumber, JsonValue.Create(SerialNumber), timestamp),
            new(MachineManifest.ProductInstanceUri, JsonValue.Create(EffectiveProductInstanceUri), timestamp),
            new(MachineManifest.ManufacturerUri, JsonValue.Create(ManufacturerUri), timestamp),
            new(MachineManifest.Model, JsonValue.Create(Model), timestamp),
        ];
    }
}

/// <summary>
/// An element an adapter names in its manifest. For a signal of the manufacturer (<c>x-&lt;domain&gt;.&lt;path&gt;</c>)
/// <see cref="Signal"/> gives its type, its unit and a description, as the model asks.
/// </summary>
/// <param name="Path">The path of the element.</param>
/// <param name="TimestampSource"><c>source</c> when the device gives the time, <c>adapter</c> when the adapter does.</param>
/// <param name="Signal">What the manifest says about a signal of the manufacturer.</param>
public sealed record MachineElement(string Path, string TimestampSource = MachineElement.Adapter, MachineSignal? Signal = null)
{
    /// <summary>The time of a value is the time the adapter read it.</summary>
    public const string Adapter = "adapter";

    /// <summary>The time of a value is the time the device gives.</summary>
    public const string Source = "source";
}

/// <summary>Type, unit (for a number, its code and name in the catalogue) and description of a signal of the manufacturer.</summary>
public sealed record MachineSignal(string Type, string? UnitCode, string? UnitName, string Description)
{
    /// <summary>A text.</summary>
    public static MachineSignal Text(string description) => new("string", null, null, description);

    /// <summary>A truth value.</summary>
    public static MachineSignal Flag(string description) => new("boolean", null, null, description);

    /// <summary>A number with its unit.</summary>
    public static MachineSignal Number(MachineUnit unit, string description)
    {
        ArgumentNullException.ThrowIfNull(unit);
        return new("number", unit.Code, unit.Name, description);
    }

    /// <summary>A whole number with its unit.</summary>
    public static MachineSignal WholeNumber(MachineUnit unit, string description)
    {
        ArgumentNullException.ThrowIfNull(unit);
        return new("integer", unit.Code, unit.Name, description);
    }
}

/// <summary>A unit of the catalogue of the model: its code (UN/ECE) and its name, which goes on the wire.</summary>
public sealed record MachineUnit(string Code, string Name)
{
    /// <summary>Dimensionless, a fraction or a count.</summary>
    public static readonly MachineUnit One = new("C62", "one");

    /// <summary>Seconds.</summary>
    public static readonly MachineUnit Second = new("SEC", "second");

    /// <summary>Metres.</summary>
    public static readonly MachineUnit Metre = new("MTR", "metre");

    /// <summary>Degrees Celsius.</summary>
    public static readonly MachineUnit DegreeCelsius = new("CEL", "degreeCelsius");
}

/// <summary>
/// The manifest of an adapter: model version, profiles, machine id and every element it publishes. A declared
/// profile is named whole: what it asks for and the machine lacks says <c>"available": false</c>, and the adapter
/// publishes it once with <c>value: null</c>.
/// </summary>
public static class MachineManifest
{
    /// <summary>The profile every adapter declares.</summary>
    public const string CoreProfile = "Core";

    /// <summary><c>Identification.Manufacturer</c>.</summary>
    public const string Manufacturer = "Identification.Manufacturer";

    /// <summary><c>Identification.SerialNumber</c>.</summary>
    public const string SerialNumber = "Identification.SerialNumber";

    /// <summary><c>Identification.ProductInstanceUri</c>.</summary>
    public const string ProductInstanceUri = "Identification.ProductInstanceUri";

    /// <summary><c>Identification.ManufacturerUri</c>.</summary>
    public const string ManufacturerUri = "Identification.ManufacturerUri";

    /// <summary><c>Identification.Model</c>.</summary>
    public const string Model = "Identification.Model";

    /// <summary><c>State.Status</c>, the snapshot of <c>MachineryItemState</c> and <c>MachineryOperationMode</c>.</summary>
    public const string Status = "State.Status";

    /// <summary>
    /// The elements of the profile <c>Core</c> of the model 0.17.1, in the order of its catalogue: every adapter
    /// names them all.
    /// </summary>
    public static readonly IReadOnlyList<string> Core =
    [
        Manufacturer, SerialNumber, ProductInstanceUri, ManufacturerUri, Model,
        "Identification.ProductCode", "Identification.YearOfConstruction",
        MachineBinding.Heartbeat, MachineBinding.ConnectionState,
        Status, "State.FeedOverride", "Notification.ActiveAlerts", "OperationCounters.PowerOnDuration",
    ];

    /// <summary>
    /// The five elements every adapter delivers, whatever the device: never <c>"available": false</c>.
    /// </summary>
    public static readonly IReadOnlySet<string> AlwaysAvailable = new HashSet<string>(StringComparer.Ordinal)
    {
        MachineBinding.Heartbeat, MachineBinding.ConnectionState, Manufacturer, SerialNumber, ProductInstanceUri,
    };

    /// <summary>
    /// The manifest of an adapter that declares the profile <c>Core</c>: the elements of <c>Core</c> it delivers
    /// (<paramref name="delivered"/>, besides the identification and the connection, which every adapter delivers),
    /// the others of <c>Core</c> with <c>"available": false</c>, then its signals of the manufacturer.
    /// </summary>
    /// <param name="identity">Who the machine is.</param>
    /// <param name="heartbeatInterval">How often the heartbeat comes.</param>
    /// <param name="delivered">Every element the adapter publishes besides identification and connection.</param>
    public static JsonObject Build(MachineIdentity identity, TimeSpan heartbeatInterval, IEnumerable<MachineElement> delivered)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(delivered);
        var given = delivered.ToList();
        var byPath = given.ToDictionary(e => e.Path, StringComparer.Ordinal);
        var identification = new HashSet<string>(StringComparer.Ordinal) { Manufacturer, SerialNumber, ProductInstanceUri, ManufacturerUri, Model, MachineBinding.Heartbeat, MachineBinding.ConnectionState };

        var elements = new JsonArray();
        foreach (var path in Core)
        {
            if (byPath.TryGetValue(path, out var element))
            {
                elements.Add(Element(element));
            }
            else if (identification.Contains(path))
            {
                elements.Add(Element(new MachineElement(path)));
            }
            else
            {
                elements.Add(new JsonObject { ["path"] = path, ["available"] = false });
            }
        }
        foreach (var element in given.Where(e => !Core.Contains(e.Path)))
        {
            elements.Add(Element(element));
        }

        return new JsonObject
        {
            ["modelVersion"] = MachineBinding.ModelVersion,
            ["bindingVersion"] = MachineBinding.BindingVersion,
            // A field of the binding: the level of the topics, so that no consumer has to form it.
            ["machineId"] = identity.MachineId,
            ["machine"] = new JsonObject { ["ProductInstanceUri"] = identity.EffectiveProductInstanceUri },
            ["profiles"] = new JsonArray(CoreProfile),
            ["heartbeatInterval"] = heartbeatInterval.TotalSeconds,
            ["elements"] = elements,
        };
    }

    /// <summary>The paths a manifest names with <c>"available": false</c>: published once with <c>value: null</c>.</summary>
    public static IReadOnlyList<string> Unavailable(JsonObject manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        return manifest["elements"] is JsonArray elements
            ? [.. elements.OfType<JsonObject>().Where(e => e["available"]?.GetValue<bool>() == false).Select(e => e["path"]!.GetValue<string>())]
            : [];
    }

    private static JsonObject Element(MachineElement element)
    {
        var json = new JsonObject
        {
            ["path"] = element.Path,
            ["timestampSource"] = element.TimestampSource,
        };
        if (element.Signal is { } signal)
        {
            json["type"] = signal.Type;
            if (signal.UnitCode is not null)
            {
                json["unit"] = new JsonObject { ["code"] = signal.UnitCode, ["name"] = signal.UnitName };
            }
            json["description"] = signal.Description;
        }
        return json;
    }
}
