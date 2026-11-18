using System.ComponentModel;
using Microsoft.AspNetCore.Authorization;
using ModelContextProtocol;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Ultimaker.Api;

[McpServerToolType]
internal sealed class UltimakerTools(ArtifactStore store, CuraSlicer slicer, PrinterClient printer)
{
    [McpServerTool(Name = "ultimaker_printer_status", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Read the configured Ultimaker model, firmware, status, print cores and loaded material UUIDs. Temperatures are kelvin.")]
    public Task<PrinterStatus> Status(CancellationToken cancellationToken) => Guard(() => printer.StatusAsync(cancellationToken));

    [McpServerTool(Name = "ultimaker_profiles_list", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("List supported slicing profiles. Initial support: Ultimaker 3, PLA, left AA 0.4. Dimensions are metre.")]
    public SlicingProfile[] Profiles() => [CuraSlicer.Profile];

    [Authorize(Policy = "ultimaker:write")]
    [McpServerTool(Name = "ultimaker_model_store", ReadOnly = false, Destructive = false),
     Description("Store a base64-encoded STL in the container. STL coordinates must be millimetres. Centre it on the bed and return an immutable model ID. For larger files use raw REST POST /models.")]
    public Task<ModelArtifact> Store(string base64Stl, CancellationToken cancellationToken) => Guard(async () =>
    {
        if (base64Stl.Length > (store.MaximumModelBytes + 2L) / 3 * 4)
            throw new ArgumentException("Encoded STL exceeds the model size limit.");
        using var input = new MemoryStream(Convert.FromBase64String(base64Stl));
        return await store.StoreModelAsync(input, cancellationToken).ConfigureAwait(false);
    });

    [Authorize(Policy = "ultimaker:write")]
    [McpServerTool(Name = "ultimaker_model_slice", ReadOnly = false, Destructive = false),
     Description("Slice a stored STL with the fixed PLA / left AA 0.4 profile. MaterialId is the loaded PLA UUID. Layer height is metre, infill is a fraction 0–1. Returns G-code SHA-256, download path, time in second and volume in cubic metre. Never uploads or prints.")]
    public Task<SliceArtifact> Slice(string modelId, string materialId, double layerHeightMetre = .0002,
        double infillFraction = .2, bool support = false, string profileId = "ultimaker3-pla-aa04-left",
        CancellationToken cancellationToken = default)
        => Guard(() => slicer.SliceAsync(new(modelId, materialId, layerHeightMetre, infillFraction, support, profileId), cancellationToken));

    [McpServerTool(Name = "ultimaker_slice_validate", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Recheck a completed artifact's SHA-256 and static nozzle paths against the travel envelope and plate-clip exclusions. Return SI bounds and limitations. This is not full print-head collision simulation.")]
    public Task<ValidationReport> Validate(string sliceId, CancellationToken cancellationToken) => Guard(async () =>
    {
        var slice = await store.GetSliceAsync(sliceId, cancellationToken).ConfigureAwait(false);
        var bytes = await File.ReadAllBytesAsync(store.GcodePath(sliceId), cancellationToken).ConfigureAwait(false);
        if (ArtifactStore.Hash(bytes) != slice.Sha256) throw new InvalidDataException("Artifact hash does not match metadata.");
        return GcodeValidation.CompleteAndValidate(bytes, slice.MaterialId).Report;
    });

    [McpServerTool(Name = "ultimaker_slice_get", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Get metadata and the G-code download link of a completed slice by its ID.")]
    public Task<SliceArtifact> GetSlice(string sliceId, CancellationToken cancellationToken)
        => Guard(() => store.GetSliceAsync(sliceId, cancellationToken));

    [Authorize(Policy = "ultimaker:write")]
    [McpServerTool(Name = "ultimaker_printer_pair", ReadOnly = false, Destructive = false),
     Description("Request API pairing. Show the given user name on the printer display, where a person must approve. Store credentials privately; no secret is returned. Does not print.")]
    public Task<PairStatus> Pair(string user, CancellationToken cancellationToken)
        => Guard(() => printer.PairAsync(new(user), cancellationToken));

    [McpServerTool(Name = "ultimaker_pairing_status", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Check printer-display pairing approval and verify stored Digest credentials without returning them.")]
    public Task<PairStatus> PairingStatus(CancellationToken cancellationToken)
        => Guard(() => printer.PairStatusAsync(cancellationToken));

    [Authorize(Policy = "ultimaker:write")]
    [McpServerTool(Name = "ultimaker_slice_validate_header", ReadOnly = false, Idempotent = true, Destructive = false),
     Description("Ask the paired printer to validate the exact stored slice header without starting a print. Returns slice ID, SHA-256, printer ID and warning/error findings. Passed requires zero findings. Independent of printing enablement; not collision simulation.")]
    public Task<PrinterHeaderValidation> ValidateHeader(string sliceId, CancellationToken cancellationToken)
        => Guard(() => printer.ValidateHeaderAsync(sliceId, cancellationToken));

    [McpServerTool(Name = "ultimaker_print_current", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Read the current printer job, state, result, progress fraction, times in second and exact slice associations. Job is null if no job exists. Finished does not certify part quality or a clear build plate.")]
    public Task<CurrentPrinterJob> CurrentPrint(CancellationToken cancellationToken)
        => Guard(() => printer.CurrentJobAsync(cancellationToken));

    [McpServerTool(Name = "ultimaker_print_history", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Read a bounded page of printer history with results, UTC timestamps, durations in second and exact slice associations. Offset starts at zero; count is 1..100. External jobs have no inferred slice association.")]
    public Task<PrintHistoryPage> PrintHistory(int offset = 0, int count = 20, CancellationToken cancellationToken = default)
        => Guard(() => printer.HistoryAsync(offset, count, cancellationToken));

    [McpServerTool(Name = "ultimaker_print_get", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Read one historical printer job by its UUID, including exact slice associations. Unknown UUIDs are errors.")]
    public Task<PrinterJob> GetPrint(string printerJobId, CancellationToken cancellationToken)
        => Guard(() => printer.HistoryJobAsync(printerJobId, cancellationToken));

    [McpServerTool(Name = "ultimaker_slice_prints", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("List durable local submission attempts for a slice. Includes uploading/unknown attempts whose upload outcome is ambiguous. Do not retry automatically. Count is 1..100; this is not the device's job history.")]
    public Task<PrintSubmissionPage> SlicePrints(string sliceId, int offset = 0, int count = 20,
        CancellationToken cancellationToken = default)
        => Guard(() => store.SlicePrintsAsync(sliceId, offset, count, cancellationToken));

    [Authorize(Policy = "ultimaker:write")]
    [McpServerTool(Name = "ultimaker_print_start", ReadOnly = false, Destructive = true, Idempotent = false),
     Description("UPLOAD AND START a completed slice on the physical printer. Requires printing enabled, paired credentials, idle printer, matching left AA 0.4 / PLA material, and the exact SHA-256 from slicing. Invoke only on an explicit instruction to print this artifact. Do not automatically retry failures: upload may already have started printing.")]
    public Task<PrintResult> Start(string sliceId, string sha256, string jobName, CancellationToken cancellationToken)
        => Guard(() => printer.StartAsync(new(sliceId, sha256, jobName), cancellationToken));

    private static async Task<T> Guard<T>(Func<Task<T>> action)
    {
        try { return await action().ConfigureAwait(false); }
        catch (Exception e) when (e is ArgumentException or FormatException or InvalidOperationException
            or IOException or TimeoutException or HttpRequestException or System.Xml.XmlException)
        {
            throw new McpException(e.Message, e);
        }
    }
}
