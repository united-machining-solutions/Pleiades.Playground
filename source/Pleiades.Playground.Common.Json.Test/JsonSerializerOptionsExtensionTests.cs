using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Common.Json.Test;

[TestClass]
public class JsonSerializerOptionsExtensionTests
{
    [TestMethod]
    public void SetPleiadesBaseDefaults_SetsNumberHandling()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesBaseDefaults();

        // Assert
        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, options.NumberHandling);
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_SetsCamelCasePropertyNaming()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesBaseDefaults();

        // Assert
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_SetsCamelCaseDictionaryKeyPolicy()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesBaseDefaults();

        // Assert
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.DictionaryKeyPolicy);
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_SetsPropertyNameCaseInsensitive()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesBaseDefaults();

        // Assert
        Assert.IsTrue(options.PropertyNameCaseInsensitive);
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_DoesNotAddJsonStringEnumConverter()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesBaseDefaults();

        // Assert
        Assert.IsFalse(options.Converters.Any(c => c is JsonStringEnumConverter));
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_ReturnsOptionsForChaining()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        var result = options.SetPleiadesBaseDefaults();

        // Assert
        Assert.AreSame(options, result);
    }

    [TestMethod]
    public void SetPleiadesBaseDefaults_NullOptions_ThrowsArgumentNullException()
    {
        // Arrange
        JsonSerializerOptions? options = null;

        // Act & Assert
        Assert.ThrowsExactly<ArgumentNullException>(() => options!.SetPleiadesBaseDefaults());
    }

    [TestMethod]
    public void SetPleiadesDefaults_AddsJsonStringEnumConverter()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesDefaults();

        // Assert
        Assert.IsTrue(options.Converters.Any(c => c is JsonStringEnumConverter));
    }

    [TestMethod]
    public void SetPleiadesDefaults_SetsBaseDefaults()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesDefaults();

        // Assert
        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, options.NumberHandling);
        Assert.IsTrue(options.PropertyNameCaseInsensitive);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.DictionaryKeyPolicy);
    }

    [TestMethod]
    public void SetPleiadesDefaults_ReturnsOptionsForChaining()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        var result = options.SetPleiadesDefaults();

        // Assert
        Assert.AreSame(options, result);
    }

    [TestMethod]
    public void SetPleiadesDefaults_NullOptions_ThrowsArgumentNullException()
    {
        // Arrange
        JsonSerializerOptions? options = null;

        // Act & Assert
        Assert.ThrowsExactly<ArgumentNullException>(() => options!.SetPleiadesDefaults());
    }

    [TestMethod]
    public void PleiadesDefaultJsonOptions_HasJsonStringEnumConverter()
    {
        // Act
        var options = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

        // Assert
        Assert.IsTrue(options.Converters.Any(c => c is JsonStringEnumConverter));
    }

    [TestMethod]
    public void PleiadesDefaultJsonOptions_HasBaseDefaults()
    {
        // Act
        var options = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

        // Assert
        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, options.NumberHandling);
        Assert.IsTrue(options.PropertyNameCaseInsensitive);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.DictionaryKeyPolicy);
    }

    [TestMethod]
    public void PleiadesDefaultJsonOptions_ReturnsSameInstance()
    {
        // Act
        var first = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;
        var second = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

        // Assert
        Assert.AreSame(first, second);
    }

    [TestMethod]
    public void AddPleiadesDefaultJsonOptions_ConfiguresIOptionsJsonSerializerOptions()
    {
        // Arrange
        var services = new ServiceCollection();

        // Act
        services.AddPleiadesDefaultJsonOptions();
        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<JsonSerializerOptions>>().Value;

        // Assert
        Assert.AreEqual(JsonNumberHandling.AllowNamedFloatingPointLiterals, options.NumberHandling);
        Assert.IsTrue(options.PropertyNameCaseInsensitive);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.PropertyNamingPolicy);
        Assert.AreEqual(JsonNamingPolicy.CamelCase, options.DictionaryKeyPolicy);
        Assert.IsTrue(options.Converters.Any(c => c is JsonStringEnumConverter));
    }

    [TestMethod]
    public void SetPleiadesDefaults_AddsExactlyOneJsonStringEnumConverter()
    {
        // Arrange
        var options = new JsonSerializerOptions();

        // Act
        options.SetPleiadesDefaults();

        // Assert
        var enumConverterCount = options.Converters.Count(c => c is JsonStringEnumConverter);
        Assert.AreEqual(1, enumConverterCount);
    }
}
