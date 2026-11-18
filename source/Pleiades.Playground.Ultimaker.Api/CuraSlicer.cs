using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed class CuraSlicer(ArtifactStore store, IOptions<UltimakerOptions> options) : IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public static SlicingProfile Profile { get; } = new("ultimaker3-pla-aa04-left", "Ultimaker 3", "PLA", "AA 0.4", .17, .19, .195);

    public async Task<SliceArtifact> SliceAsync(SliceRequest request, CancellationToken token)
    {
        Validate(request);
        var modelPath = store.ModelPath(request.ModelId);
        if (!await _gate.WaitAsync(0, token).ConfigureAwait(false))
            throw new InvalidOperationException("A slice is running. Wait for it to finish before submitting another.");
        string? directory = null;
        try
        {
            directory = store.NewDirectory(out var id);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromSeconds(options.Value.SliceTimeoutSecond));
            var start = CreateStartInfo(options.Value, request, modelPath, store.GcodePath(id));
            using var process = new Process { StartInfo = start };
            if (!process.Start()) throw new InvalidOperationException("CuraEngine could not start.");
            // Drain both pipes concurrently; cap retained diagnostics to avoid unbounded memory use.
            var stdout = DrainAsync(process.StandardOutput);
            var stderr = DrainAsync(process.StandardError);
            try
            {
                await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
                await Task.WhenAll(stdout, stderr).ConfigureAwait(false);
                if (token.IsCancellationRequested) throw;
                throw new TimeoutException("CuraEngine exceeded the configured slicing timeout.");
            }
            await stdout.ConfigureAwait(false);
            var diagnostics = await stderr.ConfigureAwait(false);
            if (process.ExitCode != 0 || !File.Exists(store.GcodePath(id)))
                throw new InvalidOperationException($"CuraEngine failed (exit {process.ExitCode}). {diagnostics}");
            var raw = await File.ReadAllBytesAsync(store.GcodePath(id), token).ConfigureAwait(false);
            var (bytes, validation) = GcodeValidation.CompleteAndValidate(raw, request.MaterialId);
            await File.WriteAllBytesAsync(store.GcodePath(id), bytes, token).ConfigureAwait(false);
            await ArtifactStore.WriteAsync(Path.Combine(directory, "validation.json"), validation, token).ConfigureAwait(false);
            var header = GcodeHeader.Read(bytes);
            var result = new SliceArtifact(id, request.ModelId, request.MaterialId, request.LayerHeightMetre,
                request.InfillFraction, request.Support, ArtifactStore.Hash(bytes), header.TimeSecond,
                header.VolumeCubicMetre, DateTimeOffset.UtcNow, $"/slices/{id}/gcode", $"/slices/{id}/validation");
            await ArtifactStore.WriteAsync(Path.Combine(directory, "slice.json"), result, token).ConfigureAwait(false);
            return result;
        }
        catch
        {
            if (directory is not null) Directory.Delete(directory, true);
            throw;
        }
        finally { _gate.Release(); }
    }

    internal static void Validate(SliceRequest request)
    {
        if (request.ProfileId != Profile.Id) throw new ArgumentException("Unknown ProfileId. List /profiles or ultimaker_profiles_list.");
        if (!Guid.TryParse(request.MaterialId, out _)) throw new ArgumentException("MaterialId must be the loaded PLA material UUID.");
        if (!double.IsFinite(request.LayerHeightMetre) || request.LayerHeightMetre < .00006 || request.LayerHeightMetre > .0003)
            throw new ArgumentException("LayerHeightMetre must be between 0.00006 and 0.0003 metre.");
        if (!double.IsFinite(request.InfillFraction) || request.InfillFraction < 0 || request.InfillFraction > 1)
            throw new ArgumentException("InfillFraction must be between 0 and 1.");
    }

    internal static ProcessStartInfo CreateStartInfo(UltimakerOptions options, SliceRequest request, string input, string output)
    {
        var start = new ProcessStartInfo(options.EnginePath)
        {
            UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
            CreateNoWindow = true,
        };
        var extrudersDirectory = Path.GetFullPath(Path.Combine(options.DefinitionsDirectory, "..", "extruders"));
        start.Environment["CURA_ENGINE_SEARCH_PATH"] = options.DefinitionsDirectory + Path.PathSeparator + extrudersDirectory;
        start.Environment["OMP_NUM_THREADS"] = "2";
        var bundledLibraries = Path.Combine(Path.GetDirectoryName(options.EnginePath)!, "lib");
        if (Directory.Exists(bundledLibraries)) start.Environment["LD_LIBRARY_PATH"] = bundledLibraries;
        start.ArgumentList.Add("slice");
        start.ArgumentList.Add("-j");
        start.ArgumentList.Add(Path.Combine(options.DefinitionsDirectory, "ultimaker3.def.json"));
        // The CLI reads default_value, not Cura's Python expressions. Supply the effective settings
        // needed by this fixed profile explicitly. Do not pretend to evaluate a desktop Cura stack.
        var settings = new Dictionary<string, string>
        {
            ["machine_name"] = "Ultimaker 3", ["machine_gcode_flavor"] = "Griffin",
            ["machine_width"] = "233", ["machine_depth"] = "215", ["machine_height"] = "200",
            ["machine_extruder_count"] = "2", ["extruders_enabled_count"] = "1",
            ["machine_center_is_zero"] = "false", ["center_object"] = "false",
            ["machine_start_gcode"] = "", ["machine_end_gcode"] = "",
            ["material_print_temp_prepend"] = "false", ["material_bed_temp_prepend"] = "false",
            ["layer_height"] = Number(request.LayerHeightMetre * 1000), ["layer_height_0"] = "0.2",
            ["line_width"] = "0.4", ["wall_line_width"] = "0.4", ["wall_line_width_0"] = "0.4",
            ["wall_line_width_x"] = "0.4", ["skin_line_width"] = "0.4", ["infill_line_width"] = "0.4",
            ["initial_layer_line_width_factor"] = "100", ["wall_line_count"] = "3",
            ["wall_thickness"] = "1.2", ["top_layers"] = Number(Math.Ceiling(.8 / (request.LayerHeightMetre * 1000))),
            ["bottom_layers"] = Number(Math.Ceiling(.8 / (request.LayerHeightMetre * 1000))),
            ["infill_sparse_density"] = Number(request.InfillFraction * 100),
            ["infill_line_distance"] = request.InfillFraction == 0 ? "0" : Number(0.8 / request.InfillFraction),
            ["infill_pattern"] = "grid", ["infill_overlap"] = "10", ["infill_overlap_mm"] = "0.04",
            ["speed_print"] = "50", ["speed_infill"] = "50", ["speed_wall"] = "30", ["speed_wall_0"] = "25",
            ["speed_wall_x"] = "40", ["speed_topbottom"] = "30", ["speed_travel"] = "150",
            ["speed_layer_0"] = "20", ["speed_print_layer_0"] = "20", ["speed_travel_layer_0"] = "60",
            ["acceleration_enabled"] = "true", ["acceleration_print"] = "1500", ["acceleration_travel"] = "3000",
            ["adhesion_type"] = "brim", ["brim_width"] = "4", ["brim_line_count"] = "10",
            ["skirt_brim_line_width"] = "0.4", ["skirt_brim_speed"] = "20",
            ["support_enable"] = request.Support ? "true" : "false", ["support_type"] = "everywhere",
            ["support_angle"] = "50", ["support_line_width"] = "0.4", ["support_line_distance"] = "2.66",
            ["support_top_distance"] = Number(request.LayerHeightMetre * 1000),
            ["support_bottom_distance"] = Number(request.LayerHeightMetre * 1000),
            ["support_xy_distance"] = "0.7", ["support_extruder_nr"] = "0",
            ["support_infill_extruder_nr"] = "0", ["support_extruder_nr_layer_0"] = "0",
            ["adhesion_extruder_nr"] = "0", ["support_roof_extruder_nr"] = "0", ["support_bottom_extruder_nr"] = "0",
            ["prime_tower_enable"] = "false", ["retraction_enable"] = "true", ["retraction_amount"] = "6.5",
            ["retraction_speed"] = "25", ["retraction_retract_speed"] = "25", ["retraction_prime_speed"] = "25",
            ["retraction_min_travel"] = "1.5", ["retraction_count_max"] = "25", ["retraction_extrusion_window"] = "6.5",
            ["cool_fan_enabled"] = "true", ["cool_fan_speed"] = "100", ["cool_fan_speed_min"] = "100",
            ["cool_fan_speed_max"] = "100", ["cool_fan_speed_0"] = "0", ["cool_fan_full_layer"] = "2",
            ["material_bed_temperature"] = "60", ["material_bed_temperature_layer_0"] = "60",
        };
        AddSettings(start, settings);
        for (var extruder = 0; extruder < 2; extruder++)
        {
            start.ArgumentList.Add($"-e{extruder}");
            start.ArgumentList.Add("-j");
            start.ArgumentList.Add(Path.Combine(extrudersDirectory,
                extruder == 0 ? "ultimaker3_extruder_left.def.json" : "ultimaker3_extruder_right.def.json"));
            AddSettings(start, new Dictionary<string, string>
            {
                ["extruder_nr"] = extruder.ToString(CultureInfo.InvariantCulture),
                ["machine_nozzle_size"] = "0.4", ["machine_nozzle_id"] = "AA 0.4",
                ["machine_extruder_start_code"] = "", ["machine_extruder_end_code"] = "",
                ["material_diameter"] = "2.85", ["material_flow"] = "100", ["material_flow_layer_0"] = "100",
                ["material_guid"] = request.MaterialId, ["material_print_temperature"] = "200",
                ["material_print_temperature_layer_0"] = "200", ["material_initial_print_temperature"] = "200",
                ["material_final_print_temperature"] = "200", ["material_standby_temperature"] = "175",
                ["extruder_prime_pos_x"] = "10", ["extruder_prime_pos_y"] = "10", ["extruder_prime_pos_z"] = "2",
                ["extruder_prime_pos_abs"] = "true", ["prime_blob_enable"] = "true",
            });
        }
        start.ArgumentList.Add("-e0");
        start.ArgumentList.Add("-l"); start.ArgumentList.Add(input);
        start.ArgumentList.Add("-o"); start.ArgumentList.Add(output);
        return start;
    }

    private static void AddSettings(ProcessStartInfo start, Dictionary<string, string> settings)
    {
        foreach (var (key, value) in settings)
        {
            start.ArgumentList.Add("-s"); start.ArgumentList.Add($"{key}={value}");
        }
    }
    private static string Number(double value) => value.ToString("G17", CultureInfo.InvariantCulture);
    private static async Task<string> DrainAsync(StreamReader reader)
    {
        var buffer = new char[4096]; var retained = new System.Text.StringBuilder();
        int count;
        while ((count = await reader.ReadAsync(buffer).ConfigureAwait(false)) > 0)
        {
            retained.Append(buffer, 0, count);
            if (retained.Length > 8000) retained.Remove(0, retained.Length - 8000);
        }
        return retained.ToString();
    }
    public void Dispose() => _gate.Dispose();
}

internal sealed record GcodeHeader(double TimeSecond, double VolumeCubicMetre)
{
    internal static GcodeHeader Read(byte[] data)
    {
        var text = System.Text.Encoding.UTF8.GetString(data);
        if (!text.Contains(";FLAVOR:Griffin", StringComparison.Ordinal)
            || !text.Contains(";TARGET_MACHINE.NAME:Ultimaker 3", StringComparison.Ordinal)
            || !text.Contains(";END_OF_HEADER", StringComparison.Ordinal)
            || !text.Contains(";LAYER:0", StringComparison.Ordinal))
            throw new InvalidDataException("CuraEngine did not produce a complete Ultimaker 3 Griffin artifact.");
        var time = ReadValue(text, ";PRINT.TIME:");
        var volume = ReadValue(text, ";EXTRUDER_TRAIN.0.MATERIAL.VOLUME_USED:");
        if (time <= 0 || volume <= 0) throw new InvalidDataException("Slice contains no printable extrusion.");
        return new(time, volume * 1e-9);
    }
    private static double ReadValue(string text, string prefix)
    {
        var line = text.Split('\n').FirstOrDefault(x => x.StartsWith(prefix, StringComparison.Ordinal));
        if (line is null || !double.TryParse(line[prefix.Length..].Trim(), CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value)) throw new InvalidDataException($"Missing or invalid G-code header: {prefix}");
        return value;
    }
}
