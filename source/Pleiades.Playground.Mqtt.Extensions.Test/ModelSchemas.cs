using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Mqtt.Extensions.Testing;

/// <summary>
/// Checks manifests and values of a producer against the JSON schemas of the data model, as the tests of the
/// simulator do. The model is not part of this repository (contracts/datamodel): it is read from a clone next to the
/// repository, or from the folder in <c>UMATI_DATAMODEL_DIR</c>; without one a test that needs it is inconclusive.
/// The adapters' tests link this file.
/// </summary>
internal static class ModelSchemas
{
    private const string CloneName = "MachineTool-DataModel";
    private const string EnvironmentVariable = "UMATI_DATAMODEL_DIR";

    private static readonly Lazy<string?> Model = new(Locate);

    /// <summary>
    /// The manifest is valid after the schema of the model, once <c>machineId</c> is taken off, a field of the
    /// binding the schema does not know.
    /// </summary>
    public static void AssertManifestValid(JsonObject manifest)
    {
        var model = manifest.DeepClone().AsObject();
        model.Remove("machineId");
        AssertValid(Schema("manifest.schema.json"), model.ToJsonString(), "manifest");
    }

    /// <summary>
    /// Every value message is valid after the schema of the runtime values, once <c>unit</c> is taken off, which
    /// the binding adds; a number of a signal of the manufacturer carries the unit its manifest names.
    /// </summary>
    public static void AssertValuesValid(IEnumerable<MqttApplicationMessage> messages, string machineId, JsonObject manifest)
    {
        var schema = Schema("runtime-values.schema.json");
        var elements = manifest["elements"]!.AsArray().OfType<JsonObject>().ToDictionary(e => e["path"]!.GetValue<string>());
        var byTopic = elements.Keys.ToDictionary(path => MachineBinding.Topic(machineId, path));
        foreach (var message in messages.Where(m => m.Topic != MachineBinding.ManifestTopic(machineId)))
        {
            Assert.IsTrue(byTopic.TryGetValue(message.Topic, out var path), $"the manifest names {message.Topic}");
            var envelope = JsonNode.Parse(message.ConvertPayloadToString())!.AsObject();
            var unit = (string?)envelope["unit"];
            if (envelope["value"] is JsonValue value && value.GetValueKind() == JsonValueKind.Number && path.StartsWith("x-", StringComparison.Ordinal))
            {
                Assert.AreEqual((string?)elements[path]["unit"]?["name"], unit, $"unit of {path}");
            }
            envelope.Remove("unit");
            AssertValid(schema, new JsonObject { [path] = envelope }.ToJsonString(), path);
        }
    }

    public static JsonSchema Schema(string name)
    {
        if (Model.Value is not { } model)
        {
            Assert.Inconclusive($"No clone of the data model found: put {CloneName} next to the repository or set {EnvironmentVariable}.");
            throw new InvalidOperationException();
        }
        var options = new BuildOptions { SchemaRegistry = new SchemaRegistry() };
        return JsonSchema.FromText(File.ReadAllText(Path.Combine(model, "schema", name)), options);
    }

    public static bool IsValid(JsonSchema schema, string json)
    {
        using var document = JsonDocument.Parse(json);
        return schema.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List, RequireFormatValidation = true }).IsValid;
    }

    public static void AssertValid(JsonSchema schema, string json, string what)
    {
        using var document = JsonDocument.Parse(json);
        var result = schema.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List, RequireFormatValidation = true });
        if (!result.IsValid)
        {
            var errors = result.Details?.Where(d => d.Errors is not null)
                .SelectMany(d => d.Errors!.Select(e => $"{d.InstanceLocation}: {e.Value}")) ?? [];
            Assert.Fail($"{what} is not valid: {json}\n{string.Join('\n', errors.Take(10))}");
        }
    }

    private static string? Locate()
    {
        var configured = Environment.GetEnvironmentVariable(EnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return IsModel(configured) ? configured : null;
        }
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, CloneName);
            if (IsModel(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

    private static bool IsModel(string directory)
    {
        var catalog = Path.Combine(directory, "catalog", "catalog.yaml");
        return File.Exists(Path.Combine(directory, "schema", "runtime-values.schema.json"))
            && File.Exists(catalog)
            && File.ReadLines(catalog).Take(20).Any(l => l == $"version: {MachineBinding.ModelVersion}");
    }
}
