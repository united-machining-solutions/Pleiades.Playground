using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>
/// What the printer says, as values of the MQTT binding: the state as the snapshot <c>State.Status</c> of the model,
/// everything else as signals of the manufacturer below the prefix <c>x-&lt;domain&gt;</c>, which the binding maps to
/// <c>oem/</c>. Their paths begin with <c>Ultimaker</c>, as the topics did before the payloads followed the binding.
/// </summary>
internal static partial class TelemetryMapper
{
    /// <summary>The first segment of every signal below the prefix of the manufacturer.</summary>
    internal const string Root = "Ultimaker";

    /// <summary>How many extruders the manifest names before the printer has reported any: an Ultimaker 3 has two.</summary>
    internal const int DefaultExtruders = 2;

    /// <summary>
    /// The machine has no operation modes of the model: <c>None</c>, which OPC 40001 gives for "no operation mode
    /// available". The schema of the snapshot asks for both fields.
    /// </summary>
    internal const string NoOperationMode = "None";

    /// <summary>The state of the model for a printer that answers in a state the model has no word for.</summary>
    internal const string OutOfService = "OutOfService";

    /// <summary>The whole of what the printer says now; a value it does not give is left out.</summary>
    internal static IReadOnlyList<MachineValue> Map(JsonElement printer, JsonElement? job, DateTimeOffset observedAt, MachineIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);
        var values = new List<MachineValue>();
        void Text(string relative, string? value)
        {
            if (!string.IsNullOrEmpty(value)) values.Add(new(identity.Signal(relative), JsonValue.Create(value), observedAt));
        }
        void Number(string relative, JsonElement? value, MachineUnit unit, double scale = 1, double? min = null, double? max = null)
        {
            if (value is not { ValueKind: JsonValueKind.Number } element || !element.TryGetDouble(out var number)
                || !double.IsFinite(number) || (min.HasValue && number < min) || (max.HasValue && number > max)) return;
            values.Add(new(identity.Signal(relative), JsonValue.Create(number * scale), observedAt, unit.Name));
        }
        var status = String(Find(printer, "status"));
        Text(Root + ".PrinterStatus", status);
        Number(Root + ".Bed.Temperature", Find(printer, "bed", "temperature", "current"), MachineUnit.DegreeCelsius);
        Number(Root + ".Bed.TargetTemperature", Find(printer, "bed", "temperature", "target"), MachineUnit.DegreeCelsius);
        if (Find(printer, "heads") is { ValueKind: JsonValueKind.Array } heads && heads.GetArrayLength() > 0)
        {
            var head = heads[0];
            foreach (var axis in new[] { "x", "y", "z" })
                Number(Root + ".Position." + axis.ToUpperInvariant(), Find(head, "position", axis), MachineUnit.Metre, .001);
            Number(Root + ".FanFraction", Find(head, "fan"), MachineUnit.One, .01, 0, 100);
            if (Find(head, "extruders") is { ValueKind: JsonValueKind.Array } extruders)
            {
                var index = 0;
                foreach (var extruder in extruders.EnumerateArray())
                {
                    var prefix = Root + ".Extruder." + index.ToString(CultureInfo.InvariantCulture) + ".";
                    Number(prefix + "Temperature", Find(extruder, "hotend", "temperature", "current"), MachineUnit.DegreeCelsius);
                    Number(prefix + "TargetTemperature", Find(extruder, "hotend", "temperature", "target"), MachineUnit.DegreeCelsius);
                    Number(prefix + "MaterialRemainingLength", Find(extruder, "active_material", "length_remaining"), MachineUnit.Metre, .001, 0);
                    index++;
                }
            }
        }
        var jobState = job is { } current ? String(Find(current, "state")) : "none";
        Text(Root + ".Print.State", jobState);
        if (job is { } active && jobState != "none")
        {
            Text(Root + ".Print.JobId", String(Find(active, "uuid")));
            Text(Root + ".Print.Result", String(Find(active, "result")));
            Number(Root + ".Print.Progress", Find(active, "progress"), MachineUnit.One, 1, 0, 1);
            Number(Root + ".Print.TimeElapsed", Find(active, "time_elapsed"), MachineUnit.Second, 1, 0);
            Number(Root + ".Print.TimeTotal", Find(active, "time_total"), MachineUnit.Second, 1, 0);
        }
        // The snapshot of the model: the printer has answered, so it always carries a state of the model. A state the
        // model has no word for is OutOfService, "available but unable to perform any activity (e.g., error)", as
        // the catalogue of the model says: the printer answers, so it is not switched off (NotAvailable), and it
        // does not wait for an order either (NotExecuting). Never null here, or the last state would stand.
        var machineState = status switch
        {
            "error" or "maintenance" => OutOfService,
            "booting" => "NotAvailable",
            _ => jobState switch
            {
                "printing" => "Executing",
                "pausing" or "paused" or "resuming" or "pre_print" or "post_print" or "wait_cleanup" or "wait_user_action" => "NotExecuting",
                "none" when status == "idle" => "NotExecuting",
                _ => OutOfService,
            },
        };
        values.Add(new(MachineManifest.Status,
            new JsonObject { ["MachineryItemState"] = machineState, ["MachineryOperationMode"] = NoOperationMode }, observedAt));
        return values;
    }

    /// <summary>The paths of the signals below the prefix of a printer with <paramref name="extruders"/> extruders.</summary>
    internal static IReadOnlyList<string> Signals(int extruders)
    {
        var paths = new List<string>
        {
            Root + ".PrinterStatus", Root + ".Bed.Temperature", Root + ".Bed.TargetTemperature",
            Root + ".Position.X", Root + ".Position.Y", Root + ".Position.Z", Root + ".FanFraction",
        };
        for (var i = 0; i < extruders; i++)
        {
            var prefix = Root + ".Extruder." + i.ToString(CultureInfo.InvariantCulture) + ".";
            paths.AddRange([prefix + "Temperature", prefix + "TargetTemperature", prefix + "MaterialRemainingLength"]);
        }
        paths.AddRange([Root + ".Print.State", Root + ".Print.JobId", Root + ".Print.Result", Root + ".Print.Progress",
            Root + ".Print.TimeElapsed", Root + ".Print.TimeTotal"]);
        return paths;
    }

    /// <summary>What the manifest says about a signal below the prefix: type, unit and description.</summary>
    /// <exception cref="ArgumentException">The path is no signal of this adapter.</exception>
    internal static MachineSignal Describe(string relative)
    {
        ArgumentNullException.ThrowIfNull(relative);
        if (ExtruderPath().Match(relative) is { Success: true } extruder)
        {
            var n = extruder.Groups[1].Value;
            return extruder.Groups[2].Value switch
            {
                "Temperature" => MachineSignal.Number(MachineUnit.DegreeCelsius, $"Temperature of the hot end of extruder {n}"),
                "TargetTemperature" => MachineSignal.Number(MachineUnit.DegreeCelsius, $"Target temperature of the hot end of extruder {n}"),
                _ => MachineSignal.Number(MachineUnit.Metre, $"Length of material left on the spool of extruder {n}"),
            };
        }
        return relative switch
        {
            Root + ".PrinterStatus" => MachineSignal.Text("Status of the printer as its API says it, for example idle or printing"),
            Root + ".Bed.Temperature" => MachineSignal.Number(MachineUnit.DegreeCelsius, "Temperature of the build plate"),
            Root + ".Bed.TargetTemperature" => MachineSignal.Number(MachineUnit.DegreeCelsius, "Target temperature of the build plate"),
            Root + ".Position.X" => MachineSignal.Number(MachineUnit.Metre, "Position of the print head on the axis X"),
            Root + ".Position.Y" => MachineSignal.Number(MachineUnit.Metre, "Position of the print head on the axis Y"),
            Root + ".Position.Z" => MachineSignal.Number(MachineUnit.Metre, "Position of the print head on the axis Z"),
            Root + ".FanFraction" => MachineSignal.Number(MachineUnit.One, "Speed of the fan of the print head as a fraction of its maximum"),
            Root + ".Print.State" => MachineSignal.Text("State of the print job as the API of the printer says it, none without one"),
            Root + ".Print.JobId" => MachineSignal.Text("Id of the print job"),
            Root + ".Print.Result" => MachineSignal.Text("Result of the print job as the API of the printer says it"),
            Root + ".Print.Progress" => MachineSignal.Number(MachineUnit.One, "Progress of the print job as a fraction"),
            Root + ".Print.TimeElapsed" => MachineSignal.Number(MachineUnit.Second, "Time the print job has run"),
            Root + ".Print.TimeTotal" => MachineSignal.Number(MachineUnit.Second, "Time the print job takes in all, as the printer estimates it"),
            _ => throw new ArgumentException($"'{relative}' is no signal of the Ultimaker telemetry.", nameof(relative)),
        };
    }

    /// <summary>
    /// The manifest: the profile Core with the snapshot <c>State.Status</c>, and every signal of
    /// <paramref name="signals"/> (paths below the prefix).
    /// </summary>
    internal static System.Text.Json.Nodes.JsonObject Manifest(MachineIdentity identity, TimeSpan heartbeatInterval, IEnumerable<string> signals)
    {
        ArgumentNullException.ThrowIfNull(identity);
        IEnumerable<MachineElement> elements =
        [
            new(MachineManifest.Status),
            .. signals.Select(relative => new MachineElement(identity.Signal(relative), MachineElement.Adapter, Describe(relative))),
        ];
        return MachineManifest.Build(identity, heartbeatInterval, elements);
    }

    private static JsonElement? Find(JsonElement element, params string[] path)
    {
        foreach (var name in path)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var child)) return null;
            element = child;
        }
        return element;
    }
    private static string? String(JsonElement? value)
        => value is { ValueKind: JsonValueKind.String } element ? element.GetString() : null;

    [GeneratedRegex(@"^Ultimaker\.Extruder\.([0-9]+)\.(Temperature|TargetTemperature|MaterialRemainingLength)$")]
    private static partial Regex ExtruderPath();
}
