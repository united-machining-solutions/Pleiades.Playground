using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using ModelContextProtocol.Server;
using DescriptionAttribute = System.ComponentModel.DescriptionAttribute;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>A temperature that the sample service writes as <c>"21.5C"</c>, through a converter it registers for HTTP only.</summary>
public readonly record struct Celsius(double Value);

/// <summary>A sample entity with a domain value and a property that is <see langword="null"/>.</summary>
public sealed record Gauge(string Id, Celsius Temperature, string? Note);

/// <summary>Writes <see cref="Celsius"/> as <c>"21.5C"</c>; without it a temperature is <c>{"value":21.5}</c>.</summary>
public sealed class CelsiusConverter : JsonConverter<Celsius>
{
    public override Celsius Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        new(double.Parse(reader.GetString()!.TrimEnd('C'), CultureInfo.InvariantCulture));

    public override void Write(Utf8JsonWriter writer, Celsius value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.Value.ToString(CultureInfo.InvariantCulture) + "C");
    }
}

/// <summary>A kind of gauge, to see how enum parameters bind and how their schema reads.</summary>
public enum GaugeKind
{
    Pressure,
    Temperature,
}

/// <summary>What <c>sample_gauges_query</c> received, echoed back.</summary>
public sealed record GaugeQuery(int Take, GaugeKind Kind);

/// <summary>The gauge a tool and its REST twin (<c>GET /gauges/{id}</c>) both return.</summary>
internal static class GaugeStore
{
    internal static Gauge Get(string id) => new(id, new Celsius(21.5), Note: null);
}

[McpServerToolType]
public sealed class GaugeTools
{
    [McpServerTool(Name = "sample_gauges_get_by_id", ReadOnly = true),
     Description("Get a gauge by id.")]
    public static Gauge GetById([Description("Gauge id.")] string id) => GaugeStore.Get(id);

    [McpServerTool(Name = "sample_gauges_list", ReadOnly = true),
     Description("List the gauges g1 and g2.")]
    public static IReadOnlyList<Gauge> List() => [GaugeStore.Get("g1"), GaugeStore.Get("g2")];

    [McpServerTool(Name = "sample_gauges_query", ReadOnly = true),
     Description("Echo the query it received.")]
    public static GaugeQuery Query(
        [Description("Number of gauges.")] int take = 2,
        [Description("Kind of gauge.")] GaugeKind kind = GaugeKind.Pressure) => new(take, kind);
}
