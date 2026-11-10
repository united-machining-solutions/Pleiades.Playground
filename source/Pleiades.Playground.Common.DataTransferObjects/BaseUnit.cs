using System.Text.Json.Serialization;

namespace Pleiades.Playground.Common.DataTransferObjects;

/// <summary>
/// The unit of a numeric value. Every quantity has exactly one unit, its coherent SI unit, so no
/// value is ambiguous: lengths are metres, energy is joule, ratios and percentages are fractions
/// with the unit <see cref="One"/> (1.0 = 100 %). Displays convert, the wire and the storage do not.
/// The JSON name of a member is the name of the unit in lower camel case, for example <c>"joule"</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<BaseUnit>))]
public enum BaseUnit
{
    /// <summary>Dimensionless: ratio, fraction, count. 1.0 = 100 %.</summary>
    [JsonStringEnumMemberName("one")]
    One = 0,

    /// <summary>Length, position, distance (m).</summary>
    [JsonStringEnumMemberName("metre")]
    Metre,

    /// <summary>Plane angle (rad).</summary>
    [JsonStringEnumMemberName("radian")]
    Radian,

    /// <summary>Time, duration (s).</summary>
    [JsonStringEnumMemberName("second")]
    Second,

    /// <summary>Mass (kg).</summary>
    [JsonStringEnumMemberName("kilogram")]
    Kilogram,

    /// <summary>Velocity, feed rate (m/s).</summary>
    [JsonStringEnumMemberName("metrePerSecond")]
    MetrePerSecond,

    /// <summary>Acceleration (m/s²).</summary>
    [JsonStringEnumMemberName("metrePerSecondSquared")]
    MetrePerSecondSquared,

    /// <summary>Jerk (m/s³).</summary>
    [JsonStringEnumMemberName("metrePerSecondCubed")]
    MetrePerSecondCubed,

    /// <summary>Rotational speed, angular velocity (rad/s).</summary>
    [JsonStringEnumMemberName("radianPerSecond")]
    RadianPerSecond,

    /// <summary>Angular acceleration (rad/s²).</summary>
    [JsonStringEnumMemberName("radianPerSecondSquared")]
    RadianPerSecondSquared,

    /// <summary>Force (N).</summary>
    [JsonStringEnumMemberName("newton")]
    Newton,

    /// <summary>Torque (N·m).</summary>
    [JsonStringEnumMemberName("newtonMetre")]
    NewtonMetre,

    /// <summary>Pressure (Pa).</summary>
    [JsonStringEnumMemberName("pascal")]
    Pascal,

    /// <summary>Active power (W).</summary>
    [JsonStringEnumMemberName("watt")]
    Watt,

    /// <summary>Apparent power (VA).</summary>
    [JsonStringEnumMemberName("voltAmpere")]
    VoltAmpere,

    /// <summary>Reactive power (var).</summary>
    [JsonStringEnumMemberName("var")]
    Var,

    /// <summary>Energy (J).</summary>
    [JsonStringEnumMemberName("joule")]
    Joule,

    /// <summary>Electric current (A).</summary>
    [JsonStringEnumMemberName("ampere")]
    Ampere,

    /// <summary>Voltage (V).</summary>
    [JsonStringEnumMemberName("volt")]
    Volt,

    /// <summary>Frequency (Hz).</summary>
    [JsonStringEnumMemberName("hertz")]
    Hertz,

    /// <summary>Temperature (°C).</summary>
    [JsonStringEnumMemberName("degreeCelsius")]
    DegreeCelsius,

    /// <summary>Area (m²).</summary>
    [JsonStringEnumMemberName("squareMetre")]
    SquareMetre,

    /// <summary>Volume (m³).</summary>
    [JsonStringEnumMemberName("cubicMetre")]
    CubicMetre,

    /// <summary>Volume flow rate (m³/s).</summary>
    [JsonStringEnumMemberName("cubicMetrePerSecond")]
    CubicMetrePerSecond,

    /// <summary>Density (kg/m³).</summary>
    [JsonStringEnumMemberName("kilogramPerCubicMetre")]
    KilogramPerCubicMetre,

    /// <summary>Electrical conductivity (S/m).</summary>
    [JsonStringEnumMemberName("siemensPerMetre")]
    SiemensPerMetre,
}
