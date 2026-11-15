// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Json.Schema;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>
/// Checks every message of the spec output against the JSON schemas and the units of the data model. The model is
/// not part of this repository (contracts/datamodel): the test reads it from a clone next to the repository, or
/// from the folder in <c>UMATI_DATAMODEL_DIR</c>, and is skipped without one.
/// </summary>
[TestClass]
public sealed partial class SchemaConformanceTest
{
    private const string CloneName = "MachineTool-DataModel";
    private const string EnvironmentVariable = "UMATI_DATAMODEL_DIR";

    private static string _model = string.Empty;

    [ClassInitialize]
    public static void FindModel(TestContext context)
    {
        _ = context;
        _model = Locate() ?? string.Empty;
    }

    [TestMethod]
    public void Validator_RejectsWhatTheModelRejects()
    {
        var runtime = Schema("runtime-values.schema.json");
        Assert.IsTrue(Validate(runtime, File.ReadAllText(Path.Combine(_model, "examples", "runtime-example.json"))).IsValid);
        foreach (var invalid in Directory.GetFiles(Path.Combine(_model, "examples", "invalid"), "runtime-*.json"))
        {
            Assert.IsFalse(Validate(runtime, File.ReadAllText(invalid)).IsValid, Path.GetFileName(invalid));
        }
    }

    [TestMethod]
    public void Manifest_IsValid()
    {
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        AssertValid(Schema("manifest.schema.json"), manifest.ToJsonString(), "manifest");
    }

    [TestMethod]
    public void EveryValue_IsValidAndCarriesTheUnitOfTheCatalog()
    {
        var runtime = Schema("runtime-values.schema.json");
        var units = CatalogUnits();
        var run = MachineRun.For(TimeSpan.FromHours(6), MachineRun.Config(TimeSpan.FromMinutes(20)));
        var values = run.Messages.OfType<SpecValue>()
            .Append(new SpecValue(SpecElements.ConnectionState, JsonValue.Create("Disconnected"), null, MachineRun.Start, null))
            .Append(new SpecValue(SpecElements.ConnectionState, JsonValue.Create("Connected"), null, MachineRun.Start, null))
            .ToList();

        Assert.IsTrue(values.Count > 1000);
        foreach (var value in values)
        {
            // What goes on the wire, parsed back.
            var envelope = JsonNode.Parse(SpecWire.Envelope(value).ToJsonString())!.AsObject();
            var catalogUnit = units.GetValueOrDefault(CatalogPath(value.Path));
            var isNumber = envelope["value"] is JsonValue v && v.GetValueKind() == JsonValueKind.Number;
            Assert.AreEqual(isNumber ? catalogUnit : null, (string?)envelope["unit"], $"unit of {value.Path}");

            // The unit belongs to the binding, the schema of the model describes the envelope without it.
            envelope.Remove("unit");
            AssertValid(runtime, new JsonObject { [value.Path] = envelope }.ToJsonString(), value.Path);
        }
    }

    [TestMethod]
    public void EveryEvent_IsValidAndNamedInTheManifest()
    {
        var schema = Schema("event.schema.json");
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        var named = manifest["events"]!.AsArray().Select(e => e!.GetValue<string>()).ToHashSet();
        var run = MachineRun.For(TimeSpan.FromHours(6), MachineRun.Config(TimeSpan.FromMinutes(20)));
        var events = run.Messages.OfType<SpecEvent>().ToList();

        CollectionAssert.AreEquivalent(named.ToList(), events.Select(e => e.Path).Distinct().ToList(), "every event of the manifest comes");
        foreach (var specEvent in events)
        {
            AssertValid(schema, SpecWire.Event(specEvent).ToJsonString(), specEvent.Path);
        }
    }

    [TestMethod]
    public void EveryElementOfTheManifest_IsPublished()
    {
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        var elements = manifest["elements"]!.AsArray().Select(e => e!["path"]!.GetValue<string>()).ToHashSet();
        var run = MachineRun.For(TimeSpan.FromMinutes(10));
        var published = run.Messages.OfType<SpecValue>().Select(v => v.Path).Append(SpecElements.ConnectionState).ToHashSet();
        CollectionAssert.AreEquivalent(elements.ToList(), published.ToList());
    }

    private static MachineIdentity Identity()
    {
        return new MachineIdentity("Example Machine Tools", "P-04", "https://example.com/P-04");
    }

    private static JsonSchema Schema(string name)
    {
        if (string.IsNullOrEmpty(_model))
        {
            Assert.Inconclusive($"No clone of the data model found: put {CloneName} next to the repository or set {EnvironmentVariable}.");
        }
        var options = new BuildOptions { SchemaRegistry = new SchemaRegistry() };
        return JsonSchema.FromText(File.ReadAllText(Path.Combine(_model, "schema", name)), options);
    }

    private static EvaluationResults Validate(JsonSchema schema, string json)
    {
        using var document = JsonDocument.Parse(json);
        return schema.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List, RequireFormatValidation = true });
    }

    private static void AssertValid(JsonSchema schema, string json, string what)
    {
        var result = Validate(schema, json);
        if (!result.IsValid)
        {
            var errors = result.Details?.Where(d => d.Errors is not null)
                .SelectMany(d => d.Errors!.Select(e => $"{d.InstanceLocation}: {e.Value}")) ?? [];
            Assert.Fail($"{what} is not valid: {json}\n{string.Join('\n', errors.Take(10))}");
        }
    }

    /// <summary>The unit name of every element of the catalog that has one, read line by line.</summary>
    private static Dictionary<string, string> CatalogUnits()
    {
        var units = new Dictionary<string, string>();
        string? path = null;
        var inUnit = false;
        foreach (var line in File.ReadLines(Path.Combine(_model, "catalog", "catalog.yaml")))
        {
            if (line.StartsWith("- path: ", StringComparison.Ordinal))
            {
                path = line["- path: ".Length..].Trim();
                inUnit = false;
            }
            else if (line == "  unit:")
            {
                inUnit = true;
            }
            else if (inUnit && line.StartsWith("    name: ", StringComparison.Ordinal) && path is not null)
            {
                units[path] = line["    name: ".Length..].Trim();
            }
            else if (!line.StartsWith("    ", StringComparison.Ordinal))
            {
                inUnit = false;
            }
        }
        return units;
    }

    /// <summary>The path of the catalog for a path at runtime: instance keys become their placeholders.</summary>
    private static string CatalogPath(string path)
    {
        path = InstanceKey().Replace(path, "$1.<n>.");
        return MeasuringPoint().Replace(path, "Consumption.$1.<MeasuringPoint>.");
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
            && File.ReadLines(catalog).Take(20).Any(l => l == $"version: {SpecElements.ModelVersion}");
    }

    [GeneratedRegex(@"^(Channel|Spindle)\.[0-9]+\.")]
    private static partial Regex InstanceKey();

    [GeneratedRegex(@"^Consumption\.([A-Za-z]+)\.(Main|Sub[0-9]+)\.")]
    private static partial Regex MeasuringPoint();
}
