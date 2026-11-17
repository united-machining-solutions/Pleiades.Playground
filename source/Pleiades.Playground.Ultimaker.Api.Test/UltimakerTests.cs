using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Ultimaker.Api.Test;

[TestClass]
public sealed partial class UltimakerTests
{
    private const string Material = "9c1959d0-f597-46ec-9131-34020c7a54fc";
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void BinaryStlIsCentredAndMalformedOrOversizedGeometryIsRejected()
    {
        var normalized = StlModel.Normalize(Cube());
        Assert.AreEqual(12U, BitConverter.ToUInt32(normalized, 80));
        var vertices = Enumerable.Range(0, 12).SelectMany(t => Enumerable.Range(0, 3)
            .Select(v => (X: BitConverter.ToSingle(normalized, 84 + t * 50 + 12 + v * 12),
                Z: BitConverter.ToSingle(normalized, 84 + t * 50 + 20 + v * 12)))).ToArray();
        Assert.AreEqual(-5F, vertices.Min(v => v.X));
        Assert.AreEqual(5F, vertices.Max(v => v.X));
        Assert.AreEqual(0F, vertices.Min(v => v.Z));
        Assert.Throws<ArgumentException>(() => StlModel.Normalize(Cube(201)));
        Assert.Throws<ArgumentException>(() => StlModel.Normalize([0, 1, 2]));
        var invalid = Cube();
        BitConverter.GetBytes(float.NaN).CopyTo(invalid, 96);
        Assert.Throws<ArgumentException>(() => StlModel.Normalize(invalid));
    }

    [TestMethod]
    public void PublicSiSettingsBecomeManufacturerSettingsWithoutShellInterpolation()
    {
        var request = new SliceRequest(Guid.NewGuid().ToString("N"), Material, .00012, .25, true);
        var start = CuraSlicer.CreateStartInfo(new(), request, "/data/a model.stl", "/data/out.gcode");
        Assert.IsFalse(start.UseShellExecute);
        Assert.Contains("/data/a model.stl", start.ArgumentList);
        Assert.Contains("infill_sparse_density=25", start.ArgumentList);
        Assert.Contains("infill_line_distance=3.2000000000000002", start.ArgumentList);
        Assert.Contains("support_enable=true", start.ArgumentList);
        Assert.Throws<ArgumentException>(() => CuraSlicer.Validate(request with { InfillFraction = double.NaN }));
        Assert.Throws<ArgumentException>(() => CuraSlicer.Validate(request with { LayerHeightMetre = .2 }));
        Assert.Throws<ArgumentException>(() => CuraSlicer.Validate(request with { ProfileId = "unknown" }));
    }

    [TestMethod]
    public async Task McpDiscoveryAndRestExposeTheSameProfileAndWriteGuards()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
            host.UseSetting("Config:Auth:Enabled", "false"));
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);
        var tools = await connection.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);
        Assert.IsTrue(tools.Any(t => t.Name == "ultimaker_print_start"));
        var result = await connection.Client.CallToolAsync("ultimaker_profiles_list", cancellationToken: TestContext.CancellationToken);
        var text = string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text));
        Assert.Contains("ultimaker3-pla-aa04-left", text, StringComparison.Ordinal);
        var rest = await http.GetFromJsonAsync<SlicingProfile[]>("/profiles", TestContext.CancellationToken);
        Assert.AreEqual(CuraSlicer.Profile, rest![0]);
        Assert.IsEmpty(factory.Services.GetRequiredService<McpServerConventionReport>().Deviations);
        var refused = await http.PostAsJsonAsync("/printer/print", new PrintRequest("invalid", "bad", "test"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [TestMethod]
    public async Task PairingNeverReturnsTheKeyAndPrintingUsesTheExactArtifact()
    {
        using var fixture = new Fixture();
        var paired = await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken);
        Assert.AreEqual("pending-display-approval", paired.State);
        Assert.DoesNotContain("private-key", JsonSerializer.Serialize(paired), StringComparison.Ordinal);
        Assert.AreEqual("authorized", (await fixture.Printer.PairStatusAsync(TestContext.CancellationToken)).State);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken);
        var result = await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken);
        Assert.AreEqual("accepted", result.State);
        Assert.AreEqual(1, fixture.Transport.UploadCount);
        Assert.Contains("name=jobname", fixture.Transport.UploadBody!, StringComparison.Ordinal);
        Assert.Contains("cube", fixture.Transport.UploadBody!, StringComparison.Ordinal);
        Assert.Contains(";FLAVOR:Griffin", fixture.Transport.UploadBody!, StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow("printing")]
    [DataRow("wrong-material")]
    [DataRow("wrong-core")]
    [DataRow("wrong-model")]
    [DataRow("tampered")]
    [DataRow("not-pla")]
    public async Task FailedPreflightNeverUploads(string scenario)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken);
        fixture.Transport.Scenario = scenario;
        if (scenario == "tampered") await File.AppendAllTextAsync(fixture.Store.GcodePath(slice.Id), ";tampered", TestContext.CancellationToken);
        try
        {
            await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken);
            Assert.Fail("Expected preflight rejection.");
        }
        catch (Exception e) when (e is ArgumentException or InvalidOperationException or InvalidDataException) { }
        Assert.AreEqual(0, fixture.Transport.UploadCount);
    }

    [TestMethod]
    public async Task AmbiguousUploadFailureIsNotRetried()
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken);
        fixture.Transport.Scenario = "upload-timeout";
        await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken));
        Assert.AreEqual(1, fixture.Transport.UploadCount);
    }

    [TestMethod]
    public void ArtifactIdsCannotEscapeTheVolume()
    {
        using var fixture = new Fixture();
        Assert.Throws<ArgumentException>(() => fixture.Store.DirectoryFor("../../etc/passwd"));
        Assert.Throws<ArgumentException>(() => fixture.Store.DirectoryFor("C:\\secret"));
    }

    [TestMethod]
    [DataRow("G1 X234 Y100 E2", "envelope")]
    [DataRow("G1 X220 Y20 Z0.2 E2", "clip")]
    [DataRow("G1 X10 Y2 Z0.2 E2", "clip")]
    [DataRow("T1", "extruder")]
    [DataRow("G2 X110 Y110 E2", "arc")]
    [DataRow("G1 XNaN Y100 E2", "coordinate")]
    public void StaticValidationRejectsUnsafeOrUnsupportedPaths(string command, string expected)
    {
        var raw = ";START_OF_HEADER\n;FLAVOR:Griffin\n;TARGET_MACHINE.NAME:Ultimaker 3\n;END_OF_HEADER\n"
            + ";LAYER:0\nG0 X100 Y100 Z0.2\nG1 X110 Y100 E1\n" + command + "\n;TIME_ELAPSED:60\n";
        var exception = Assert.Throws<InvalidDataException>(() => GcodeValidation.CompleteAndValidate(Encoding.UTF8.GetBytes(raw), Material));
        Assert.Contains(expected, exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [TestMethod]
    public async Task DigestChallengeReplaysMultipartWithoutFallingBackToBasic()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        var received = new List<string>();
        app.MapPost("/api/v1/print_job", async (HttpContext context) =>
        {
            using var reader = new StreamReader(context.Request.Body);
            received.Add(await reader.ReadToEndAsync(context.RequestAborted));
            var authorization = context.Request.Headers.Authorization.ToString();
            if (authorization.Length == 0)
            {
                context.Response.Headers.WWWAuthenticate = new Microsoft.Extensions.Primitives.StringValues(
                    new[] { "Digest realm=\"ultimaker\", nonce=\"testnonce123\", qop=\"auth\", algorithm=MD5", "Basic realm=\"ultimaker\"" });
                return Results.StatusCode(401);
            }
            Assert.StartsWith("Digest ", authorization, StringComparison.Ordinal);
            Assert.Contains("username=\"pair-id\"", authorization, StringComparison.Ordinal);
            return Results.Ok();
        });
        await app.StartAsync(TestContext.CancellationToken);
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var factory = new PrinterHttpClientFactory(Options.Create(new UltimakerOptions { PrinterBaseUrl = address }));
        using var client = factory.Create(new("pair-id", "test-key"));
        using var content = new MultipartFormDataContent();
        using var file = new ByteArrayContent(Encoding.ASCII.GetBytes(";test artifact"));
        content.Add(file, "file", "test.gcode");
        using var response = await client.PostAsync("print_job", content, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual(2, received.Count);
        Assert.AreEqual(received[0], received[1]);
        Assert.Contains(";test artifact", received[1], StringComparison.Ordinal);
        await app.StopAsync(TestContext.CancellationToken);
    }

    // Set the URL explicitly to exercise an already-running container. Never pairs or starts a print.
    [TestMethod]
    [TestCategory("Container")]
    public async Task ContainerSlicesCubeAndRejectsAnInvalidModelThroughMcp()
    {
        var url = Environment.GetEnvironmentVariable("ULTIMAKER_TEST_URL");
        if (url is null) { Assert.Inconclusive("Set ULTIMAKER_TEST_URL to the running container URL."); return; }
        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(4) };
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);
        var stored = await connection.Client.CallToolAsync("ultimaker_model_store",
            new Dictionary<string, object?> { ["base64Stl"] = Convert.ToBase64String(Cube()) }, cancellationToken: TestContext.CancellationToken);
        Assert.IsFalse(stored.IsError ?? false);
        var model = ParseResult<ModelArtifact>(stored);
        var sliced = await connection.Client.CallToolAsync("ultimaker_model_slice",
            new Dictionary<string, object?> { ["modelId"] = model.Id, ["materialId"] = Material }, cancellationToken: TestContext.CancellationToken);
        Assert.IsFalse(sliced.IsError ?? false, string.Join("", sliced.Content.OfType<TextContentBlock>().Select(c => c.Text)));
        var artifact = ParseResult<SliceArtifact>(sliced);
        Assert.IsGreaterThan(0, artifact.PrintTimeSecond);
        Assert.IsGreaterThan(0, artifact.FilamentVolumeCubicMetre);
        var gcode = await http.GetByteArrayAsync(artifact.DownloadPath, TestContext.CancellationToken);
        Assert.AreEqual(artifact.Sha256, ArtifactStore.Hash(gcode));
        GcodeHeader.Read(gcode);
        var invalid = await connection.Client.CallToolAsync("ultimaker_model_store",
            new Dictionary<string, object?> { ["base64Stl"] = "bm90IGFuIFNUTA==" }, cancellationToken: TestContext.CancellationToken);
        Assert.IsTrue(invalid.IsError);
    }

    private static T ParseResult<T>(CallToolResult result)
    {
        var text = string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text));
        return JsonSerializer.Deserialize<T>(text, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }

    internal static byte[] Cube(float size = 10)
    {
        float[][] points = [[0,0,0], [size,0,0], [size,size,0], [0,size,0], [0,0,size], [size,0,size], [size,size,size], [0,size,size]];
        int[][] triangles = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream);
        writer.Write(new byte[80]); writer.Write(12U);
        foreach (var triangle in triangles)
        {
            writer.Write(0F); writer.Write(0F); writer.Write(0F);
            foreach (var vertex in triangle) foreach (var coordinate in points[vertex]) writer.Write(coordinate);
            writer.Write((ushort)0);
        }
        return stream.ToArray();
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _root = Path.Combine(Path.GetTempPath(), "ultimaker-test-" + Guid.NewGuid().ToString("N"));
        internal readonly FakePrinter Transport = new();
        internal ArtifactStore Store { get; }
        internal PrinterClient Printer { get; }
        internal string DataDirectory => _root;
        internal Fixture()
        {
            var options = Options.Create(new UltimakerOptions { DataDirectory = _root, EnablePrinting = true });
            Store = new(options); Printer = new(Transport, Store, options);
        }
        internal async Task<SliceArtifact> AddSliceAsync(CancellationToken ct)
        {
            var directory = Store.NewDirectory(out var id);
            var data = Encoding.UTF8.GetBytes(";START_OF_HEADER\n;FLAVOR:Griffin\n;TARGET_MACHINE.NAME:Ultimaker 3\n;PRINT.TIME:60\n;EXTRUDER_TRAIN.0.MATERIAL.VOLUME_USED:1000\n;END_OF_HEADER\n;LAYER:0\nG0 X100 Y100 Z0.2\nG1 X110 Y100 E1\n;TIME_ELAPSED:60\n");
            await File.WriteAllBytesAsync(Store.GcodePath(id), data, ct);
            var result = new SliceArtifact(id, Guid.NewGuid().ToString("N"), Material, .0002, .2, false,
                ArtifactStore.Hash(data), 60, .000001, DateTimeOffset.UtcNow, $"/slices/{id}/gcode");
            await ArtifactStore.WriteAsync(Path.Combine(directory, "slice.json"), result, ct);
            return result;
        }
        public void Dispose()
        {
            Printer.Dispose();
            Transport.Dispose();
            if (Directory.Exists(_root)) Directory.Delete(_root, true);
        }
    }

    private sealed class FakePrinter : HttpMessageHandler, IPrinterHttpClientFactory
    {
        internal string Scenario = "";
        internal int UploadCount;
        internal string? UploadBody;
        internal int HeaderValidationCount;
        internal string? HeaderBody;
        internal string? HistoryQuery;
        internal Func<Task>? BeforeUpload;
        internal string PairingState = "authorized";
        internal HttpStatusCode PairingCheckStatus = HttpStatusCode.OK;
        internal int PairingRequestCount;
        internal Dictionary<string, string> ResponseOverrides = new(StringComparer.Ordinal);
        public HttpClient Create(PrinterCredentials? credentials = null)
            => new(this, false) { BaseAddress = new Uri("http://printer/api/v1/") };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/api/v1/auth/request") PairingRequestCount++;
            if (ResponseOverrides.TryGetValue(path, out var replacement))
                return new(HttpStatusCode.OK) { Content = new StringContent(replacement, Encoding.UTF8, "application/json") };
            if (path.StartsWith("/api/v1/auth/check/", StringComparison.Ordinal) && PairingCheckStatus != HttpStatusCode.OK)
                return new(PairingCheckStatus);
            if ((path == "/api/v1/print_job" && Scenario == "current-missing")
                || (path.StartsWith("/api/v1/history/print_jobs/", StringComparison.Ordinal) && Scenario == "history-missing"))
                return new(HttpStatusCode.NotFound);
            var jobId = Scenario == "external-job" ? "fbb19509-a82c-461c-945c-8cc219d941e1" : "966066fe-ce93-4b44-a6ba-a5dd2f532636";
            var job = JsonSerializer.Serialize(new { uuid = jobId, name = "cube", state = Scenario == "future-state" ? "future_state" : "printing",
                result = "", source = "WEB_API", progress = .4, time_elapsed = 24, time_total = 60, time_estimated = 59,
                datetime_started = "2026-11-17T08:00:00Z", datetime_finished = "", datetime_cleaned = "" });
            var body = path switch
            {
                "/api/v1/auth/request" => JsonSerializer.Serialize(new { id = PairingRequestCount == 1 ? "pair-id" : "pair-id-" + PairingRequestCount, key = "private-key" }),
                _ when path.StartsWith("/api/v1/auth/check/", StringComparison.Ordinal) => JsonSerializer.Serialize(new { message = PairingState }),
                "/api/v1/auth/verify" => "{}",
                "/api/v1/system" => JsonSerializer.Serialize(new { guid = Scenario == "other-printer" ? "0fd0ea9f-2fc1-4f30-b367-5b71b839c18c" : "6964c917-730a-4c9a-bef5-55de2de5fc47", variant = Scenario == "wrong-model" ? "Ultimaker S5" : "Ultimaker 3", name = "Test", firmware = "5.3.0" }),
                "/api/v1/printer" => JsonSerializer.Serialize(new { status = Scenario == "printing" ? "printing" : "idle", heads = new[] { new { extruders = new[] { new { hotend = new { id = Scenario == "wrong-core" ? "BB 0.4" : "AA 0.4", temperature = new { current = 20 } }, active_material = new { guid = Scenario == "wrong-material" ? "other" : Material } } } } } }),
                _ when path.StartsWith("/api/v1/materials/", StringComparison.Ordinal) => $"<fdmmaterial><metadata><name><material>{(Scenario == "not-pla" ? "ABS" : "PLA")}</material></name></metadata></fdmmaterial>",
                "/api/v1/printer/validate_header" => Scenario.StartsWith("header-", StringComparison.Ordinal)
                    ? JsonSerializer.Serialize(new[] { new { fault_code = "GUID_MISMATCH", fault_level = Scenario == "header-warning" ? "WARNING" : Scenario == "header-error" ? "ERROR" : "FUTURE_LEVEL", message = "Material mismatch" } }) : "[]",
                "/api/v1/print_job" when request.Method == HttpMethod.Get => Scenario == "current-none" ? "{\"state\":\"none\"}" : job,
                "/api/v1/print_job" => Scenario == "missing-uuid" ? "{}" : "{\"uuid\":\"966066fe-ce93-4b44-a6ba-a5dd2f532636\"}",
                "/api/v1/history/print_jobs" => Scenario == "history-empty" ? "[]" : "[" + job + "]",
                _ when path.StartsWith("/api/v1/history/print_jobs/", StringComparison.Ordinal) => job,
                _ => throw new InvalidOperationException("Unexpected printer endpoint: " + path),
            };
            if (path == "/api/v1/printer/validate_header")
            {
                HeaderValidationCount++;
                HeaderBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            }
            if (path == "/api/v1/history/print_jobs") HistoryQuery = request.RequestUri.Query;
            if (path == "/api/v1/print_job" && request.Method == HttpMethod.Post)
            {
                if (BeforeUpload is not null) await BeforeUpload();
                UploadCount++;
                UploadBody = await request.Content!.ReadAsStringAsync(cancellationToken);
                if (Scenario == "upload-timeout") throw new HttpRequestException("Connection lost after upload.");
            }
            return new(HttpStatusCode.OK)
            {
                Content = path.StartsWith("/api/v1/materials/", StringComparison.Ordinal)
                    ? new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
                    : new StringContent(body, Encoding.UTF8, "application/json"),
            };
        }
    }
}
