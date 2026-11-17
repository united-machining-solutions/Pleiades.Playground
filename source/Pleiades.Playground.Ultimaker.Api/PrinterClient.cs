using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed record PrinterCredentials(string Id, string Key);

internal interface IPrinterHttpClientFactory
{
    HttpClient Create(PrinterCredentials? credentials = null);
}

internal sealed class PrinterHttpClientFactory(IOptions<UltimakerOptions> options) : IPrinterHttpClientFactory
{
    public HttpClient Create(PrinterCredentials? credentials = null)
    {
        var baseUri = new Uri(new Uri(options.Value.PrinterBaseUrl), "/api/v1/");
        var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, CheckCertificateRevocationList = true };
        if (credentials is not null)
        {
            var cache = new CredentialCache();
            cache.Add(baseUri, "Digest", new NetworkCredential(credentials.Id, credentials.Key));
            handler.Credentials = cache;
        }
        return new HttpClient(handler) { BaseAddress = baseUri, Timeout = TimeSpan.FromSeconds(30) };
    }
}

internal sealed partial class PrinterClient(IPrinterHttpClientFactory clients, ArtifactStore store,
    IOptions<UltimakerOptions> options) : IDisposable
{
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private string CredentialsPath => Path.Combine(options.Value.DataDirectory, "printer-credentials.json");

    public async Task<PrinterStatus> StatusAsync(CancellationToken token)
    {
        using var client = clients.Create();
        using var system = await ReadJsonAsync(client, "system", token).ConfigureAwait(false);
        using var printer = await ReadJsonAsync(client, "printer", token).ConfigureAwait(false);
        var cores = printer.RootElement.GetProperty("heads")[0].GetProperty("extruders")
            .EnumerateArray().Select((extruder, index) => new CoreStatus(index,
                extruder.GetProperty("hotend").GetProperty("id").GetString() ?? "",
                extruder.GetProperty("active_material").GetProperty("guid").GetString(),
                extruder.GetProperty("hotend").GetProperty("temperature").GetProperty("current").GetDouble() + 273.15))
            .ToArray();
        return new(system.RootElement.GetProperty("variant").GetString() ?? "",
            system.RootElement.GetProperty("name").GetString() ?? "",
            system.RootElement.GetProperty("firmware").GetString() ?? "",
            printer.RootElement.GetProperty("status").GetString() ?? "unknown", cores, PrinterIdFrom(system.RootElement));
    }

    public async Task<PairStatus> PairAsync(PairRequest request, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.User) || request.User.Length > 80 || request.User.Any(char.IsControl))
            throw new ArgumentException("Provide the user name to show on the printer display (at most 80 characters).");
        await _writeGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            if (File.Exists(CredentialsPath))
                throw new InvalidOperationException("Pairing already exists. Poll its status; remove the credential file administratively to pair again.");
            using var client = clients.Create();
            using var form = new FormUrlEncodedContent(new Dictionary<string, string>
                { ["application"] = "Pleiades Ultimaker", ["user"] = request.User });
            using var response = await client.PostAsync("auth/request", form, token).ConfigureAwait(false);
            EnsureSuccess(response);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
            var credentials = new PrinterCredentials(json.RootElement.GetProperty("id").GetString()!,
                json.RootElement.GetProperty("key").GetString()!);
            if (string.IsNullOrWhiteSpace(credentials.Id) || string.IsNullOrWhiteSpace(credentials.Key))
                throw new InvalidDataException("Printer returned incomplete pairing credentials.");
            Directory.CreateDirectory(options.Value.DataDirectory);
            // CreateNew avoids overwriting credentials; set permissions before any secret is written.
            var fileOptions = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write };
            if (!OperatingSystem.IsWindows()) fileOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using var file = new FileStream(CredentialsPath, fileOptions);
            await JsonSerializer.SerializeAsync(file, credentials, cancellationToken: token).ConfigureAwait(false);
            return new("pending-display-approval");
        }
        finally { _writeGate.Release(); }
    }

    public async Task<PairStatus> PairStatusAsync(CancellationToken token)
    {
        await _writeGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            var credentials = await LoadCredentialsAsync(token).ConfigureAwait(false);
            if (credentials is null) return new("unpaired");
            using var client = clients.Create();
            using var check = await ReadJsonAsync(client, $"auth/check/{Uri.EscapeDataString(credentials.Id)}", token).ConfigureAwait(false);
            var state = check.RootElement.GetProperty("message").GetString() ?? "unknown";
            if (state == "authorized")
            {
                using var authenticated = clients.Create(credentials);
                using var verify = await authenticated.GetAsync("auth/verify", token).ConfigureAwait(false);
                EnsureSuccess(verify);
            }
            return new(state);
        }
        finally { _writeGate.Release(); }
    }

    public async Task<PrintResult> StartAsync(PrintRequest request, CancellationToken token)
    {
        if (!options.Value.EnablePrinting) throw new InvalidOperationException("Printing is disabled. Set Ultimaker:EnablePrinting=true explicitly.");
        if (string.IsNullOrWhiteSpace(request.JobName) || request.JobName.Length > 100 || request.JobName.Any(char.IsControl))
            throw new ArgumentException("JobName must contain 1–100 printable characters.");
        await _writeGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            var (slice, bytes) = await store.ReadCheckedSliceAsync(request.SliceId, token).ConfigureAwait(false);
            if (!string.Equals(request.Sha256, slice.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("G-code SHA-256 does not match the requested completed slice.");
            var credentials = await LoadCredentialsAsync(token).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Pair the printer and approve on its display before printing.");
            var status = await StatusAsync(token).ConfigureAwait(false);
            if (status.Model != "Ultimaker 3") throw new InvalidOperationException("The configured printer is not an Ultimaker 3.");
            if (status.Status != "idle") throw new InvalidOperationException($"Printer is {status.Status}; it must be idle before upload/start.");
            if (status.Cores.Length == 0 || status.Cores[0].Type != "AA 0.4")
                throw new InvalidOperationException("The left print core must be AA 0.4.");
            if (!string.Equals(status.Cores[0].MaterialId, slice.MaterialId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Loaded left material does not match the sliced material UUID.");
            using var client = clients.Create(credentials);
            await RequirePlaAsync(client, slice.MaterialId, token).ConfigureAwait(false);
            var validation = await ValidateHeaderCoreAsync(client, slice, bytes, status.PrinterId, token).ConfigureAwait(false);
            if (!validation.Passed)
                throw new InvalidOperationException("Printer header validation has findings. Inspect the slice's printer-validation report before printing.");
            var submission = new PrintSubmission(Guid.NewGuid().ToString("N"), slice.Id, slice.Sha256,
                status.PrinterId, request.JobName, "uploading", null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
            // Persist before any physical upload. A crash leaves an inspectable, ambiguous attempt.
            await store.SaveSubmissionAsync(submission, token).ConfigureAwait(false);
            try
            {
                using var form = new MultipartFormDataContent();
                using var jobName = new StringContent(request.JobName);
                form.Add(jobName, "jobname");
                using var file = new ByteArrayContent(bytes);
                file.Headers.ContentType = new MediaTypeHeaderValue("text/x-gcode");
                form.Add(file, "file", $"{slice.Id}.gcode");
                // This upload STARTS a print. No retry handler is installed, even for transport failures.
                using var response = await client.PostAsync("print_job", form, token).ConfigureAwait(false);
                EnsureSuccess(response);
                using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
                if (!result.RootElement.TryGetProperty("uuid", out var uuid) || !Guid.TryParse(uuid.GetString(), out var jobId))
                    throw new InvalidDataException("Printer accepted the upload without a valid job UUID. Do not retry automatically.");
                submission = submission with { State = "accepted", PrinterJobId = jobId.ToString("D"), UpdatedAt = DateTimeOffset.UtcNow };
                await store.SaveSubmissionAsync(submission, CancellationToken.None).ConfigureAwait(false);
                return new("accepted", submission.PrinterJobId, submission.Id);
            }
            catch
            {
                // Cancellation must not discard an upload that may already have started a print.
                // If the UUID was received, preserve it even when persistence of acceptance failed.
                await store.SaveSubmissionAsync(submission with { State = "unknown", UpdatedAt = DateTimeOffset.UtcNow },
                    CancellationToken.None).ConfigureAwait(false);
                throw;
            }
        }
        finally { _writeGate.Release(); }
    }

    private static async Task RequirePlaAsync(HttpClient client, string materialId, CancellationToken token)
    {
        using var response = await client.GetAsync($"materials/{Uri.EscapeDataString(materialId)}", token).ConfigureAwait(false);
        EnsureSuccess(response);
        var xml = await response.Content.ReadAsStringAsync(token).ConfigureAwait(false);
        // Firmware 5.3.0 wraps the XML material definition in a JSON string.
        if (response.Content.Headers.ContentType?.MediaType == "application/json")
            xml = JsonSerializer.Deserialize<string>(xml) ?? throw new InvalidDataException("Empty material definition.");
        using var text = new StringReader(xml);
        using var reader = XmlReader.Create(text, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
        var material = XDocument.Load(reader);
        if (!material.Descendants().Any(x => x.Name.LocalName == "material" && x.Value.Trim() == "PLA"))
            throw new InvalidOperationException("Loaded material is not identified as PLA by the printer.");
    }

    private async Task<PrinterCredentials?> LoadCredentialsAsync(CancellationToken token)
    {
        if (!File.Exists(CredentialsPath)) return null;
        return JsonSerializer.Deserialize<PrinterCredentials>(await File.ReadAllTextAsync(CredentialsPath, token).ConfigureAwait(false))
            ?? throw new InvalidDataException("Invalid credential file; pair again.");
    }
    private static async Task<JsonDocument> ReadJsonAsync(HttpClient client, string path, CancellationToken token)
    {
        using var response = await client.GetAsync(path, token).ConfigureAwait(false);
        EnsureSuccess(response);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
    }
    private static void EnsureSuccess(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Printer API returned HTTP {(int)response.StatusCode}. Check printer state before retrying.", null, response.StatusCode);
    }
    public void Dispose() => _writeGate.Dispose();
}
