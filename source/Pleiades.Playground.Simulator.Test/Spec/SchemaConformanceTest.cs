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
    [DataRow("runtime-values.schema.json", "runtime")]
    [DataRow("event.schema.json", "event")]
    [DataRow("manifest.schema.json", "manifest")]
    public void Validator_AcceptsTheExamplesAndRejectsWhatTheModelRejects(string schemaName, string prefix)
    {
        var schema = Schema(schemaName);
        var examples = Directory.GetFiles(Path.Combine(_model, "examples"), "*.json")
            .Where(f => Path.GetFileName(f).StartsWith(prefix, StringComparison.Ordinal)
                || (prefix == "event" && Path.GetFileName(f).EndsWith("-example.json", StringComparison.Ordinal)
                    && !Path.GetFileName(f).StartsWith("runtime", StringComparison.Ordinal) && !Path.GetFileName(f).StartsWith("manifest", StringComparison.Ordinal)))
            .ToList();
        Assert.IsNotEmpty(examples, prefix);
        foreach (var valid in examples)
        {
            AssertValid(schema, File.ReadAllText(valid), Path.GetFileName(valid));
        }
        var invalids = Directory.GetFiles(Path.Combine(_model, "examples", "invalid"), $"{prefix}-*.json");
        Assert.IsNotEmpty(invalids, prefix);
        foreach (var invalid in invalids)
        {
            Assert.IsFalse(Validate(schema, File.ReadAllText(invalid)).IsValid, Path.GetFileName(invalid));
        }
    }

    [TestMethod]
    public void Manifest_IsValid()
    {
        var manifest = ModelManifest();
        AssertValid(Schema("manifest.schema.json"), manifest.ToJsonString(), "manifest");

        // The schema takes a signal of the manufacturer with type, unit and description.
        var extension = manifest["elements"]!.AsArray().Single(e => e!["path"]!.GetValue<string>() == "x-alcyone-machines-example.Spindle.1.BearingTemperature")!;
        Assert.AreEqual("number", extension["type"]!.GetValue<string>());
        Assert.AreEqual("CEL", extension["unit"]!["code"]!.GetValue<string>());
        Assert.AreEqual("degreeCelsius", extension["unit"]!["name"]!.GetValue<string>());
        var program = manifest["elements"]!.AsArray().Single(e => e!["path"]!.GetValue<string>() == "x-alcyone-machines-example.WorkMasterMonitoring.ActiveProgram")!;
        Assert.AreEqual("string", program["type"]!.GetValue<string>());
        Assert.IsNull(program["unit"], "a text has no unit");
    }

    [TestMethod]
    public void Manifest_DeclaresTheProfilesItDelivers_AndTheSchemaHoldsThemWhole()
    {
        var manifest = ModelManifest();
        var profiles = manifest["profiles"]!.AsArray().Select(p => p!.GetValue<string>()).ToList();
        CollectionAssert.AreEqual(new[]
        {
            "Core", "IdentificationExtended", "Components", "MonitoringExtended", "ChannelMonitoring", "Spindle",
            "Stacklight", "EnergyElectricity", "JobMonitoring", "WorkMasterMonitoring", "AlertsEvents",
        }, profiles);

        // The schema refuses a declared profile that misses an element or an event: drop each one in turn.
        var schema = Schema("manifest.schema.json");
        foreach (var list in new[] { "elements", "events" })
        {
            var entries = manifest[list]!.AsArray();
            for (var i = 0; i < entries.Count; i++)
            {
                var path = entries[i]!["path"]!.GetValue<string>();
                if (path.StartsWith("x-", StringComparison.Ordinal))
                {
                    continue;
                }
                var without = manifest.DeepClone().AsObject();
                without[list]!.AsArray().RemoveAt(i);
                Assert.IsFalse(Validate(schema, without.ToJsonString()).IsValid, $"the manifest without {path}");
            }
        }

        // What the machine does not deliver of a declared profile, the manifest says so.
        var unavailable = manifest["elements"]!.AsArray().Where(e => e!["available"]?.GetValue<bool>() == false).Select(e => e!["path"]!.GetValue<string>()).ToList();
        CollectionAssert.AreEquivalent(SpecElements.NotDelivered.ToList(), unavailable);
        var correlated = manifest["events"]!.AsArray().Where(e => e!["correlationId"]?.GetValue<bool>() == true).Select(e => e!["path"]!.GetValue<string>()).ToList();
        Assert.IsTrue(correlated.All(p => p.StartsWith("WorkMasterMonitoring.ProgramExecution", StringComparison.Ordinal) || p.StartsWith("Notification.", StringComparison.Ordinal)));
        Assert.HasCount(9, correlated);
    }

    [TestMethod]
    public void EveryValue_IsValidAndCarriesTheUnitOfTheCatalog()
    {
        var runtime = Schema("runtime-values.schema.json");
        var units = CatalogUnits();
        var run = MachineRun.For(TimeSpan.FromHours(6), MachineRun.Config(TimeSpan.FromMinutes(20)));
        var values = run.Messages.OfType<SpecValue>()
            .Concat(new[] { SpecPublisher.Initializing, SpecPublisher.Running, SpecPublisher.CommunicationFault, SpecPublisher.Shutdown }
                .Select(state => new SpecValue(SpecElements.ConnectionState, JsonValue.Create(state), null, MachineRun.Start, null)))
            .ToList();

        Assert.IsTrue(values.Count > 1000);
        foreach (var value in values)
        {
            // What goes on the wire, parsed back.
            var envelope = JsonNode.Parse(SpecWire.Envelope(value).ToJsonString())!.AsObject();
            // A signal of the manufacturer has its unit in the manifest, an element of the model in the catalogue.
            var catalogUnit = value.Path.StartsWith("x-", StringComparison.Ordinal)
                ? ManifestUnit(value.Path)
                : units.GetValueOrDefault(CatalogPath(value.Path));
            var isNumber = envelope["value"] is JsonValue v && v.GetValueKind() == JsonValueKind.Number;
            Assert.AreEqual(isNumber ? catalogUnit : null, (string?)envelope["unit"], $"unit of {value.Path}");

            // The unit belongs to the binding, the schema of the model describes the envelope without it.
            envelope.Remove("unit");
            AssertValid(runtime, new JsonObject { [value.Path] = envelope }.ToJsonString(), value.Path);
        }
        Assert.IsTrue(values.Any(v => v.Path == SpecElements.JobOrderResults && v.Value!.AsArray().Count > 0), "results come");
    }

    [TestMethod]
    public void EveryEvent_IsValidAndNamedInTheManifest()
    {
        var schema = Schema("event.schema.json");
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        var named = manifest["events"]!.AsArray().ToDictionary(e => e!["path"]!.GetValue<string>(), e => e!["correlationId"]?.GetValue<bool>() == true);
        var run = MachineRun.For(TimeSpan.FromHours(6), MachineRun.Config(TimeSpan.FromMinutes(20)));
        var events = run.Messages.OfType<SpecEvent>().ToList();

        CollectionAssert.AreEquivalent(named.Keys.ToList(), events.Select(e => e.Path).Distinct().ToList(), "every event of the manifest comes");
        foreach (var specEvent in events)
        {
            // What goes on the wire, parsed back: a CloudEvent, which goes to the schema as it is.
            var wire = JsonNode.Parse(SpecWire.Event(specEvent, Identity().ProductInstanceUri).ToJsonString())!.AsObject();
            Assert.AreEqual(Identity().ProductInstanceUri, wire["source"]!.GetValue<string>());
            Assert.AreEqual(specEvent.Path, wire["type"]!.GetValue<string>());
            Assert.AreEqual(specEvent.Sequence, wire["sequence"]!.GetValue<string>());

            // A program execution names itself; an alert names the program execution it came up in, if any.
            var correlationId = (string?)wire["correlationid"];
            if (specEvent.Path.StartsWith("WorkMasterMonitoring.ProgramExecution", StringComparison.Ordinal))
            {
                Assert.AreEqual(wire["data"]!["ExecutionId"]!.GetValue<string>(), correlationId, specEvent.Path);
            }
            else if (specEvent.Path.StartsWith("Notification.", StringComparison.Ordinal))
            {
                Assert.AreEqual((string?)wire["data"]!["correlationId"], correlationId, specEvent.Path);
            }
            else
            {
                Assert.IsNull(correlationId, specEvent.Path);
            }
            Assert.IsTrue(correlationId is null || named[specEvent.Path], $"the manifest says {specEvent.Path} carries a correlationid");

            Assert.IsFalse(wire.ContainsKey("related"), "what goes along for the playground stays off the wire");
            if (specEvent.Path == SpecElements.JobOrderCancelled)
            {
                Assert.IsNull(specEvent.Related, "JobOrderCancelled carries a job order that never ran and has no result");
            }
            AssertValid(schema, wire.ToJsonString(), specEvent.Path);
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

    private static string? ManifestUnit(string path)
    {
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        var element = manifest["elements"]!.AsArray().Single(e => e!["path"]!.GetValue<string>() == path)!;
        return element["unit"]?["name"]?.GetValue<string>();
    }

    /// <summary>
    /// The manifest as the model knows it: without <c>machineId</c>, which the binding adds (the schema of the
    /// manifest allows no field besides its own), as the unit is taken off a value.
    /// </summary>
    private static JsonObject ModelManifest()
    {
        var manifest = SpecManifest.Build(Identity(), MachineRun.Config());
        Assert.AreEqual("alcyone-machines_GM-500_P-04", manifest["machineId"]!.GetValue<string>(), "the binding names the machine id");
        manifest.Remove("machineId");
        return manifest;
    }

    private static MachineIdentity Identity()
    {
        return new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
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
        path = InstanceKey().Replace(path, m => $"{m.Groups[1].Value}.{{{m.Groups[1].Value.ToLowerInvariant()}}}.");
        return MeasuringPoint().Replace(path, "Consumption.$1.{measuringPoint}.");
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
