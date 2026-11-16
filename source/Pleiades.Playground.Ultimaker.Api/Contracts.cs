namespace Pleiades.Playground.Ultimaker.Api;

internal sealed record CoreStatus(int Index, string Type, string? MaterialId, double TemperatureKelvin);
internal sealed record PrinterStatus(string Model, string Name, string Firmware, string Status, CoreStatus[] Cores);
internal sealed record ModelArtifact(string Id, string Sha256, long Bytes);
internal sealed record SliceRequest(string ModelId, string MaterialId, double LayerHeightMetre = 0.0002,
    double InfillFraction = 0.2, bool Support = false, string ProfileId = "ultimaker3-pla-aa04-left");
internal sealed record SliceArtifact(string Id, string ModelId, string MaterialId, double LayerHeightMetre,
    double InfillFraction, bool Support, string Sha256, double PrintTimeSecond, double FilamentVolumeCubicMetre,
    DateTimeOffset CreatedAt, string DownloadPath, string? ValidationPath = null,
    string ProfileId = "ultimaker3-pla-aa04-left");
internal sealed record PairRequest(string User);
internal sealed record PairStatus(string State);
internal sealed record PrintRequest(string SliceId, string Sha256, string JobName);
internal sealed record PrintResult(string State, string? PrinterJobId);
internal sealed record SlicingProfile(string Id, string Printer, string Material, string Core,
    double WidthMetre, double DepthMetre, double HeightMetre);

internal sealed class UltimakerOptions
{
    public string PrinterBaseUrl { get; set; } = "http://ultimaker.hub0000.ums.internal/";
    public string DataDirectory { get; set; } = "/data";
    public string EnginePath { get; set; } = "/usr/bin/CuraEngine";
    public string DefinitionsDirectory { get; set; } = "/usr/share/cura/resources/definitions";
    public int SliceTimeoutSecond { get; set; } = 180;
    public int MaximumModelBytes { get; set; } = 20 * 1024 * 1024;
    public bool EnablePrinting { get; set; }
}
