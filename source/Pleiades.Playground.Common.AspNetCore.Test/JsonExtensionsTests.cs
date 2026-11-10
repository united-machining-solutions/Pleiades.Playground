using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Common.AspNetCore.Test;

[TestClass]
public class JsonExtensionsTests
{
    private enum Sample
    {
        First,
        Second
    }

    private static JsonSerializerOptions ResolveHttpJsonOptions(IServiceCollection services)
    {
        using var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
    }

    // ---------------------------------------------------------------- positive

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_AppliesPleiadesDefaults()
    {
        var services = new ServiceCollection();

        services.AddPleiadesHttpJsonOptions();

        var options = ResolveHttpJsonOptions(services);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
        Assert.IsTrue(options.PropertyNameCaseInsensitive);
        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, options.NumberHandling);
        Assert.IsTrue(options.Converters.Any(c => c is JsonStringEnumConverter), "the JsonStringEnumConverter default must be registered");
    }

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_SerializesWithDefaults_CamelCaseProperty_EnumAsString()
    {
        var services = new ServiceCollection();
        services.AddPleiadesHttpJsonOptions();
        var options = ResolveHttpJsonOptions(services);

        var json = JsonSerializer.Serialize(new { Value = Sample.Second }, options);

        // camelCase property name, and the enum serialized as a string (not the numeric 1).
        Assert.Contains("\"value\"", json); // property name must be camelCase
        Assert.Contains("Second", json); // enum must serialize as its string name, not a number
        Assert.IsFalse(json.Contains(":1", StringComparison.Ordinal), "enum must not serialize as a number");
    }

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_WithConfigure_RegistersAndUsesCustomConverter()
    {
        var services = new ServiceCollection();

        services.AddPleiadesHttpJsonOptions(o => o.Converters.Add(new UpperCaseStringConverter()));

        var options = ResolveHttpJsonOptions(services);
        Assert.IsTrue(options.Converters.Any(c => c is UpperCaseStringConverter), "the caller's converter must be registered");

        // the custom string converter is used, while the UG defaults (camelCase property name) still apply.
        var json = JsonSerializer.Serialize(new { Name = "abc" }, options);
        Assert.AreEqual("{\"name\":\"ABC\"}", json);
    }

    // ---------------------------------------------------------------- negative / edge

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_NullConfigure_StillAppliesDefaults()
    {
        var services = new ServiceCollection();

        services.AddPleiadesHttpJsonOptions(configure: null);

        var options = ResolveHttpJsonOptions(services);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
        Assert.IsTrue(options.Converters.Any(c => c is JsonStringEnumConverter));
    }

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_CustomConverterForOtherType_DoesNotBreakEnumDefaults()
    {
        // A caller converter that only handles string must not disturb the default enum handling.
        var services = new ServiceCollection();
        services.AddPleiadesHttpJsonOptions(o => o.Converters.Add(new UpperCaseStringConverter()));
        var options = ResolveHttpJsonOptions(services);

        var json = JsonSerializer.Serialize(new { Value = Sample.Second }, options);
        Assert.Contains("Second", json); // enum still serializes as string via the UG defaults
    }

    [TestMethod]
    public void AddPleiadesHttpJsonOptions_NullServices_Throws()
    {
        IServiceCollection services = null!;

        Assert.ThrowsExactly<ArgumentNullException>(() => services.AddPleiadesHttpJsonOptions(configure: null));
    }

    private sealed class UpperCaseStringConverter : JsonConverter<string>
    {
        public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => reader.GetString() ?? string.Empty;

        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
            => writer.WriteStringValue(value.ToUpperInvariant());
    }
}
