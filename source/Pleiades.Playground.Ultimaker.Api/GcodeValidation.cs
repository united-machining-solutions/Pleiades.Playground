using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed record ToolpathBounds(double MinXMetre, double MinYMetre, double MinZMetre,
    double MaxXMetre, double MaxYMetre, double MaxZMetre);
internal sealed record ValidationReport(bool Passed, int MovementCount, ToolpathBounds Bounds,
    string[] Checks, string[] Limitations);

// Coordinates inside this boundary are the manufacturer's millimetres. Only SI values leave it.
internal static class GcodeValidation
{
    // Cura 4.13.0 ultimaker3.def.json machine_disallowed_areas, translated from bed-centred to G-code coordinates.
    private static readonly (double X0, double Y0, double X1, double Y1)[] ClipAreas =
    [ (209.3, 10, 233, 54.1), (190.3, 208, 233, 215), (191.4, 0, 233, 10),
      (0, 0, 15.6, 4), (0, 213.3, 19.6, 215) ];

    internal static (byte[] Gcode, ValidationReport Report) CompleteAndValidate(byte[] raw, string materialId)
    {
        var text = Encoding.UTF8.GetString(raw).Replace("\r\n", "\n", StringComparison.Ordinal);
        if (!text.StartsWith(";START_OF_HEADER\n", StringComparison.Ordinal)
            || !text.Contains(";FLAVOR:Griffin\n", StringComparison.Ordinal)
            || !text.Contains(";TARGET_MACHINE.NAME:Ultimaker 3\n", StringComparison.Ordinal))
            throw new InvalidDataException("Expected an Ultimaker 3 Griffin header.");
        var x = 0D; var y = 0D; var z = 0D; var e = 0D; var highE = 0D; var filament = 0D;
        var absolute = true; var absoluteExtrusion = true; var positioned = false;
        var moves = 0; var lastElapsed = 0D;
        var minX = double.PositiveInfinity; var minY = minX; var minZ = minX;
        var maxX = double.NegativeInfinity; var maxY = maxX; var maxZ = maxX;
        foreach (var rawLine in text.Split('\n'))
        {
            if (rawLine.StartsWith(";TIME_ELAPSED:", StringComparison.Ordinal))
                lastElapsed = Number(rawLine[14..]);
            var line = rawLine.Split(';', 2)[0].Trim();
            if (line.Length == 0) continue;
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var command = parts[0];
            if (command == "G90") { absolute = true; continue; }
            if (command == "G91") { absolute = false; continue; }
            if (command == "M82") { absoluteExtrusion = true; continue; }
            if (command == "M83") { absoluteExtrusion = false; continue; }
            if (command.StartsWith('T') && command != "T0") throw new InvalidDataException("Only the left extruder is supported.");
            if (command is "G2" or "G3" or "G20") throw new InvalidDataException("Unsupported arc or inch movement in G-code.");
            var values = new Dictionary<char, double>();
            foreach (var part in parts.Skip(1))
                if (part.Length > 1 && "XYZE".Contains(part[0], StringComparison.Ordinal)) values[part[0]] = Number(part[1..]);
            if (command == "G92")
            {
                if (values.Keys.Any(k => k != 'E')) throw new InvalidDataException("Unexpected XYZ origin reset.");
                e = values.GetValueOrDefault('E', e); highE = e; continue;
            }
            if (command is not ("G0" or "G1")) continue;
            var nx = Coordinate(values, 'X', x, absolute);
            var ny = Coordinate(values, 'Y', y, absolute);
            var nz = Coordinate(values, 'Z', z, absolute);
            var ne = Coordinate(values, 'E', e, absoluteExtrusion);
            var hasPosition = values.ContainsKey('X') || values.ContainsKey('Y') || values.ContainsKey('Z');
            if (hasPosition)
            {
                if (nx < 0 || nx > 233 || ny < 0 || ny > 215 || nz < 0 || nz > 200)
                    throw new InvalidDataException($"Toolpath leaves the Ultimaker 3 travel envelope at movement {moves + 1}.");
                // Check endpoints and swept segments near the plate. Higher moves are outside the clip-height check.
                foreach (var area in ClipAreas)
                    if (Math.Min(z, nz) <= 2.7 && Intersects(positioned ? x : nx, positioned ? y : ny, nx, ny, area))
                        throw new InvalidDataException($"Toolpath crosses a build-plate clip exclusion at movement {moves + 1}.");
                moves++; positioned = true;
                if (ne > e)
                {
                    minX = Math.Min(minX, nx); minY = Math.Min(minY, ny); minZ = Math.Min(minZ, nz);
                    maxX = Math.Max(maxX, nx); maxY = Math.Max(maxY, ny); maxZ = Math.Max(maxZ, nz);
                }
            }
            // Absolute extrusion high-water marks avoid counting retraction recovery twice.
            if (ne > highE) { filament += ne - highE; highE = ne; }
            x = nx; y = ny; z = nz; e = ne;
        }
        if (moves == 0 || !double.IsFinite(minX) || filament <= 0 || lastElapsed <= 0)
            throw new InvalidDataException("G-code contains no complete, timed extrusion path.");
        var end = text.IndexOf(";END_OF_HEADER", StringComparison.Ordinal);
        if (end < 0) throw new InvalidDataException("Griffin header is incomplete.");
        var additions = $";PRINT.TIME:{Format(Math.Ceiling(lastElapsed))}\n"
            + $";EXTRUDER_TRAIN.0.MATERIAL.VOLUME_USED:{Format(filament * Math.PI * Math.Pow(2.85 / 2, 2))}\n"
            + $";EXTRUDER_TRAIN.0.MATERIAL.GUID:{materialId}\n"
            + $";PRINT.SIZE.MIN.X:{Format(minX)}\n;PRINT.SIZE.MIN.Y:{Format(minY)}\n;PRINT.SIZE.MIN.Z:{Format(minZ)}\n"
            + $";PRINT.SIZE.MAX.X:{Format(maxX)}\n;PRINT.SIZE.MAX.Y:{Format(maxY)}\n;PRINT.SIZE.MAX.Z:{Format(maxZ)}\n";
        // CuraEngine CLI writes placeholder bounds and omits final stats. Replace, never duplicate, those fields.
        var headerLines = text[..end].Split('\n').Where(l => !l.StartsWith(";PRINT.SIZE.", StringComparison.Ordinal)
            && !l.StartsWith(";PRINT.TIME:", StringComparison.Ordinal)
            && !l.StartsWith(";EXTRUDER_TRAIN.0.MATERIAL.", StringComparison.Ordinal) && l.Length > 0);
        var completed = string.Join('\n', headerLines) + "\n" + additions + text[end..];
        var report = new ValidationReport(true, moves, new(minX / 1000, minY / 1000, minZ / 1000,
            maxX / 1000, maxY / 1000, maxZ / 1000),
            ["Finite STL coordinates and conservative object bounds", "Griffin format and Ultimaker 3 target",
             "Single left extruder", "XYZ travel envelope", "Nozzle segments against plate-clip exclusions below 0.0027 metre",
             "Positive extrusion, complete layers and elapsed time", "SHA-256 bound to artifact metadata"],
            ["This is a static nozzle-path check, not a full print-head or machine collision simulation.",
             "No mesh manifoldness, overhang/adhesion guarantee, existing-object detection or live bed inspection.",
             "Firmware-controlled homing, G280 priming and levelling trajectories are not simulated.",
             "Inspect the G-code layers in Cura and ensure the build plate is clear before printing."]);
        return (Encoding.UTF8.GetBytes(completed), report);
    }

    private static double Coordinate(Dictionary<char, double> values, char axis, double current, bool absolute)
        => values.TryGetValue(axis, out var value) ? absolute ? value : current + value : current;
    private static double Number(string text)
    {
        if (!double.TryParse(text, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
            throw new InvalidDataException("Non-finite or invalid G-code coordinate/time.");
        return value;
    }
    private static string Format(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);
    private static bool Intersects(double x0, double y0, double x1, double y1,
        (double X0, double Y0, double X1, double Y1) rect)
    {
        var t0 = 0D; var t1 = 1D;
        // Expand the exclusion by the nozzle radius (0.0002 metre).
        return Clip(-(x1 - x0), x0 - rect.X0 + .2, ref t0, ref t1)
            && Clip(x1 - x0, rect.X1 + .2 - x0, ref t0, ref t1)
            && Clip(-(y1 - y0), y0 - rect.Y0 + .2, ref t0, ref t1)
            && Clip(y1 - y0, rect.Y1 + .2 - y0, ref t0, ref t1);
    }
    private static bool Clip(double p, double q, ref double t0, ref double t1)
    {
        if (p == 0) return q >= 0;
        var r = q / p;
        if (p < 0) t0 = Math.Max(t0, r); else t1 = Math.Min(t1, r);
        return t0 <= t1;
    }
}
