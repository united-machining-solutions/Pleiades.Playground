using System.Globalization;
using System.Text.Json;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Ultimaker.Telemetry;

internal sealed record TelemetrySample(string Suffix, IMessage Message);

internal static class TelemetryMapper
{
    internal static IReadOnlyList<TelemetrySample> Map(JsonElement printer, JsonElement? job, DateTime observedAt)
    {
        var samples = new List<TelemetrySample>();
        void Text(string suffix, string? value)
        {
            if (!string.IsNullOrEmpty(value)) samples.Add(new(suffix, new StringValueDto { Timestamp = observedAt, Value = value }));
        }
        void Number(string suffix, JsonElement? value, BaseUnit unit, double scale = 1, double? min = null, double? max = null)
        {
            if (value is not { ValueKind: JsonValueKind.Number } element || !element.TryGetDouble(out var number)
                || !double.IsFinite(number) || (min.HasValue && number < min) || (max.HasValue && number > max)) return;
            samples.Add(new(suffix, new BaseUnitValueDto { Timestamp = observedAt, Value = number * scale, Unit = unit }));
        }
        var status = String(Find(printer, "status"));
        Text("vendor/Ultimaker/PrinterStatus", status);
        Number("vendor/Ultimaker/Bed/Temperature", Find(printer, "bed", "temperature", "current"), BaseUnit.DegreeCelsius);
        Number("vendor/Ultimaker/Bed/TargetTemperature", Find(printer, "bed", "temperature", "target"), BaseUnit.DegreeCelsius);
        if (Find(printer, "heads") is { ValueKind: JsonValueKind.Array } heads && heads.GetArrayLength() > 0)
        {
            var head = heads[0];
            foreach (var axis in new[] { "x", "y", "z" })
                Number("vendor/Ultimaker/Position/" + axis.ToUpperInvariant(), Find(head, "position", axis), BaseUnit.Metre, .001);
            Number("vendor/Ultimaker/FanFraction", Find(head, "fan"), BaseUnit.One, .01, 0, 100);
            if (Find(head, "extruders") is { ValueKind: JsonValueKind.Array } extruders)
            {
                var index = 0;
                foreach (var extruder in extruders.EnumerateArray())
                {
                    var prefix = "vendor/Ultimaker/Extruder/" + index.ToString(CultureInfo.InvariantCulture) + "/";
                    Number(prefix + "Temperature", Find(extruder, "hotend", "temperature", "current"), BaseUnit.DegreeCelsius);
                    Number(prefix + "TargetTemperature", Find(extruder, "hotend", "temperature", "target"), BaseUnit.DegreeCelsius);
                    Number(prefix + "MaterialRemainingLength", Find(extruder, "active_material", "length_remaining"), BaseUnit.Metre, .001, 0);
                    index++;
                }
            }
        }
        var jobState = job is { } current ? String(Find(current, "state")) : "none";
        Text("vendor/Ultimaker/Print/State", jobState);
        if (job is { } active && jobState != "none")
        {
            Text("vendor/Ultimaker/Print/JobId", String(Find(active, "uuid")));
            Text("vendor/Ultimaker/Print/Result", String(Find(active, "result")));
            Number("vendor/Ultimaker/Print/Progress", Find(active, "progress"), BaseUnit.One, 1, 0, 1);
            Number("vendor/Ultimaker/Print/TimeElapsed", Find(active, "time_elapsed"), BaseUnit.Second, 1, 0);
            Number("vendor/Ultimaker/Print/TimeTotal", Find(active, "time_total"), BaseUnit.Second, 1, 0);
        }
        var machineState = jobState switch
        {
            "printing" => "Executing",
            "pausing" or "paused" or "resuming" or "pre_print" or "post_print" or "wait_cleanup" or "wait_user_action" => "NotExecuting",
            "none" when status == "idle" => "NotExecuting",
            _ => null,
        };
        Text("umati/State/MachineryItemState", machineState);
        return samples;
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
}
