using System.Globalization;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>A value as it goes to the broker: exactly one of the three is set.</summary>
internal sealed record ConvertedValue(double? Number, string? Text, bool? Flag)
{
    /// <summary>The value as an object, for a response that shows it.</summary>
    public object? Boxed => Number ?? (object?)Text ?? Flag;
}

/// <summary>
/// Turns the raw value of a node into the value of an element. The registration says how; nothing
/// is guessed here, and a value that does not fit is not published.
/// </summary>
internal static class ValueConverter
{
    /// <summary>Converts <paramref name="raw"/>, or returns null if it does not fit the element.</summary>
    public static ConvertedValue? Convert(ElementRegistration element, object? raw)
    {
        ArgumentNullException.ThrowIfNull(element);

        // An element of a structure takes its member; a structure is no value of its own.
        if (element.Field is { } field)
        {
            raw = raw is StructureValue structure ? structure.Member(field) : null;
        }
        else if (raw is StructureValue)
        {
            return null;
        }

        if (raw is null)
        {
            return null;
        }

        return element.Kind switch
        {
            ValueKind.Number => Number(element, raw),
            ValueKind.Boolean => Flag(element, raw),
            _ => Text(element, raw),
        };
    }

    /// <summary>The key a raw value has in a map: its invariant text, a boolean in lower case.</summary>
    public static string KeyOf(object raw) => raw switch
    {
        bool flag => flag ? "true" : "false",
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => raw.ToString() ?? string.Empty,
    };

    private static ConvertedValue? Number(ElementRegistration element, object raw)
    {
        double number;
        try
        {
            number = raw is bool flag ? (flag ? 1 : 0) : System.Convert.ToDouble(raw, CultureInfo.InvariantCulture);
        }
        catch (Exception exception) when (exception is FormatException or InvalidCastException or OverflowException)
        {
            return null;
        }

        if (element.Scale is not null || element.Offset is not null)
        {
            number = (number * (element.Scale ?? 1)) + (element.Offset ?? 0);
            if (double.IsFinite(number))
            {
                // 32.44 kW times 1000 is 32439.999999999996 in binary. Fifteen significant digits
                // are all a double holds for certain, so the noise behind them is cut off.
                number = double.Parse(number.ToString("G15", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
            }
        }

        return double.IsFinite(number) ? new ConvertedValue(number, null, null) : null;
    }

    private static ConvertedValue? Text(ElementRegistration element, object raw)
    {
        if (element.Map is null)
        {
            var text = raw.ToString();
            return string.IsNullOrEmpty(text) ? null : new ConvertedValue(null, text, null);
        }

        var mapped = element.Map.TryGetValue(KeyOf(raw), out var found) ? found : element.MapDefault;
        return mapped is null ? null : new ConvertedValue(null, mapped, null);
    }

    private static ConvertedValue? Flag(ElementRegistration element, object raw)
    {
        if (element.Map is not null)
        {
            var mapped = element.Map.TryGetValue(KeyOf(raw), out var found) ? found : element.MapDefault;
            return bool.TryParse(mapped, out var fromMap) ? new ConvertedValue(null, null, fromMap) : null;
        }

        return raw is bool flag ? new ConvertedValue(null, null, flag) : null;
    }
}
