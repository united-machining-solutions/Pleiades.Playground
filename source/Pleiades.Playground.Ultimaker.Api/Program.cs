using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Ultimaker.Api;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 30 * 1024 * 1024);
builder.Services.AddOptions<UltimakerOptions>().BindConfiguration("Ultimaker")
    .Validate(o => Uri.TryCreate(o.PrinterBaseUrl, UriKind.Absolute, out var uri)
        && (uri.Scheme == "http" || uri.Scheme == "https") && string.IsNullOrEmpty(uri.UserInfo), "PrinterBaseUrl must be an HTTP(S) URL without credentials.")
    .Validate(o => o.MaximumModelBytes is > 0 and <= 20 * 1024 * 1024 && o.SliceTimeoutSecond is > 0 and <= 1800,
        "Model limit must be at most 20 MiB and slice timeout at most 1800 seconds.").ValidateOnStart();
builder.Services.AddPleiadesHttpJsonOptions();
builder.Services.AddPleiadesForwardedHeaders();
var auth = builder.Configuration.GetSection("Config:Auth");
builder.Services.AddPleiadesJwtAuth(auth, builder.Environment);
builder.Services.AddPleiadesFeatureAuthorization(auth, "ultimaker");
builder.Services.AddSingleton<ArtifactStore>();
builder.Services.AddSingleton<CuraSlicer>();
builder.Services.AddSingleton<IPrinterHttpClientFactory, PrinterHttpClientFactory>();
builder.Services.AddSingleton<PrinterClient>();
builder.Services.AddHealthChecks().AddCheck("cura-engine", () =>
{
    var settings = builder.Configuration.GetSection("Ultimaker").Get<UltimakerOptions>() ?? new();
    return File.Exists(settings.EnginePath) && File.Exists(Path.Combine(settings.DefinitionsDirectory, "ultimaker3.def.json"))
        ? Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy()
        : Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy("CuraEngine or definitions missing.");
});
builder.Services.AddOpenApi();
builder.Services.AddPleiadesMcpServer(mcp =>
{
    mcp.Prefix = "ultimaker";
    mcp.Title = "Slice STL models and explicitly start prints on a local Ultimaker 3.";
    mcp.Domains.Add("STL storage, CuraEngine slicing, G-code artifacts and local printer pairing/status/start.");
    mcp.DiscoveryFlow.Add("Read profiles and printer status; use the loaded PLA material UUID for slicing.");
    mcp.DiscoveryFlow.Add("Store an STL, slice it, inspect the artifact before explicitly requesting a print.");
    mcp.WritePolicy = "ultimaker:write";
}).WithPleiadesToolsFromAssembly();
var app = builder.Build();
app.UsePleiadesForwardedHeaders();
app.Use(async (context, next) =>
{
    try { await next(context).ConfigureAwait(false); }
    catch (Exception e) when (!context.Response.HasStarted && e is ArgumentException or FormatException
        or FileNotFoundException or InvalidDataException or InvalidOperationException or TimeoutException or HttpRequestException)
    {
        var status = e is FileNotFoundException ? 404 : e is TimeoutException ? 504
            : e is HttpRequestException ? 502 : e is InvalidOperationException ? 409 : 400;
        await Results.Problem(statusCode: status, detail: e.Message).ExecuteAsync(context).ConfigureAwait(false);
    }
});
app.UsePleiadesAuth();
app.MapPleiadesLiveness();
app.MapPleiadesHealthChecks();
app.MapOpenApi().RequireFeatureRead("ultimaker");
app.MapPleiadesMcp().RequireFeatureRead("ultimaker");
app.MapGet("/profiles", () => new[] { CuraSlicer.Profile }).RequireFeatureRead("ultimaker");
app.MapGet("/printer", (PrinterClient printer, CancellationToken ct) => printer.StatusAsync(ct)).RequireFeatureRead("ultimaker");
app.MapPost("/models", (HttpRequest request, ArtifactStore store, CancellationToken ct) => store.StoreModelAsync(request.Body, ct))
    .RequireFeatureWrite("ultimaker");
app.MapPost("/slices", (SliceRequest request, CuraSlicer slicer, CancellationToken ct) => slicer.SliceAsync(request, ct))
    .RequireFeatureWrite("ultimaker");
app.MapGet("/slices/{id}", (string id, ArtifactStore store, CancellationToken ct) => store.GetSliceAsync(id, ct))
    .RequireFeatureRead("ultimaker");
app.MapGet("/slices/{id}/gcode", async (string id, ArtifactStore store, CancellationToken ct) =>
{
    var slice = await store.GetSliceAsync(id, ct).ConfigureAwait(false);
    var bytes = await File.ReadAllBytesAsync(store.GcodePath(id), ct).ConfigureAwait(false);
    if (ArtifactStore.Hash(bytes) != slice.Sha256) throw new InvalidDataException("Artifact hash does not match metadata.");
    return Results.File(bytes, "text/x-gcode", $"{id}.gcode");
}).RequireFeatureRead("ultimaker");
app.MapGet("/slices/{id}/validation", async (string id, ArtifactStore store, CancellationToken ct) =>
{
    var slice = await store.GetSliceAsync(id, ct).ConfigureAwait(false);
    var bytes = await File.ReadAllBytesAsync(store.GcodePath(id), ct).ConfigureAwait(false);
    if (ArtifactStore.Hash(bytes) != slice.Sha256) throw new InvalidDataException("Artifact hash does not match metadata.");
    return GcodeValidation.CompleteAndValidate(bytes, slice.MaterialId).Report;
}).RequireFeatureRead("ultimaker");
app.MapPost("/printer/pair", (PairRequest request, PrinterClient printer, CancellationToken ct) => printer.PairAsync(request, ct))
    .RequireFeatureWrite("ultimaker");
app.MapGet("/printer/pair", (PrinterClient printer, CancellationToken ct) => printer.PairStatusAsync(ct))
    .RequireFeatureRead("ultimaker");
app.MapPost("/printer/print", (PrintRequest request, PrinterClient printer, CancellationToken ct) => printer.StartAsync(request, ct))
    .RequireFeatureWrite("ultimaker");
app.MapPost("/slices/{id}/printer-validation", (string id, PrinterClient printer, CancellationToken ct) => printer.ValidateHeaderAsync(id, ct))
    .RequireFeatureWrite("ultimaker");
app.MapGet("/printer/print/current", (PrinterClient printer, CancellationToken ct) => printer.CurrentJobAsync(ct))
    .RequireFeatureRead("ultimaker");
app.MapGet("/printer/print/history", (PrinterClient printer, CancellationToken ct, int offset = 0, int count = 20) =>
    printer.HistoryAsync(offset, count, ct)).RequireFeatureRead("ultimaker");
app.MapGet("/printer/print/history/{jobId}", (string jobId, PrinterClient printer, CancellationToken ct) =>
    printer.HistoryJobAsync(jobId, ct)).RequireFeatureRead("ultimaker");
app.MapGet("/slices/{id}/prints", (string id, ArtifactStore store, CancellationToken ct, int offset = 0, int count = 20) =>
    store.SlicePrintsAsync(id, offset, count, ct)).RequireFeatureRead("ultimaker");
await app.RunAsync().ConfigureAwait(false);

internal partial class Program;
