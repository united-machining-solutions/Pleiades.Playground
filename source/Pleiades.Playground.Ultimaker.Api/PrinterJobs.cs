using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed partial class PrinterClient
{
    public async Task<PrinterHeaderValidation> ValidateHeaderAsync(string sliceId, CancellationToken token)
    {
        await _writeGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            var (slice, bytes) = await store.ReadCheckedSliceAsync(sliceId, token).ConfigureAwait(false);
            var credentials = await LoadCredentialsAsync(token).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Pair the printer before requesting header validation.");
            using var client = clients.Create(credentials);
            var printerId = await ReadPrinterIdAsync(client, token).ConfigureAwait(false);
            return await ValidateHeaderCoreAsync(client, slice, bytes, printerId, token).ConfigureAwait(false);
        }
        finally { _writeGate.Release(); }
    }

    private static async Task<PrinterHeaderValidation> ValidateHeaderCoreAsync(HttpClient client,
        SliceArtifact slice, byte[] bytes, string printerId, CancellationToken token)
    {
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("text/x-gcode");
        form.Add(file, "file", slice.Id + ".gcode");
        // Different endpoint from print_job: this validates only and never starts a print.
        using var response = await client.PostAsync(new Uri("printer/validate_header", UriKind.Relative), form, token).ConfigureAwait(false);
        EnsureSuccess(response);
        using var json = await ReadResponseJsonAsync(response, token).ConfigureAwait(false);
        if (json.RootElement.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("Printer returned an invalid header-validation report.");
        var issues = json.RootElement.EnumerateArray().Select(item => new PrinterHeaderIssue(
            Text(item, "fault_code") ?? "UNKNOWN", Text(item, "fault_level") ?? "UNKNOWN",
            Text(item, "message") ?? "")).ToArray();
        return new(slice.Id, slice.Sha256, printerId, DateTimeOffset.UtcNow, issues.Length == 0, issues);
    }

    public async Task<CurrentPrinterJob> CurrentJobAsync(CancellationToken token)
    {
        using var client = clients.Create();
        var printerId = await ReadPrinterIdAsync(client, token).ConfigureAwait(false);
        using var response = await client.GetAsync(new Uri("print_job", UriKind.Relative), token).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound) return new(printerId, null);
        EnsureSuccess(response);
        using var json = await ReadResponseJsonAsync(response, token).ConfigureAwait(false);
        if (Text(json.RootElement, "state") == "none") return new(printerId, null);
        var submissions = await store.ReadSubmissionsAsync(token).ConfigureAwait(false);
        return new(printerId, MapJob(json.RootElement, printerId, submissions));
    }

    public async Task<PrintHistoryPage> HistoryAsync(int offset, int count, CancellationToken token)
    {
        ArtifactStore.ValidatePage(offset, count);
        using var client = clients.Create();
        var printerId = await ReadPrinterIdAsync(client, token).ConfigureAwait(false);
        using var json = await ReadJsonAsync(client,
            FormattableString.Invariant($"history/print_jobs?offset={offset}&count={count}"), token).ConfigureAwait(false);
        if (json.RootElement.ValueKind != JsonValueKind.Array || json.RootElement.GetArrayLength() > count)
            throw new InvalidDataException("Printer returned an invalid or oversized history page.");
        var submissions = await store.ReadSubmissionsAsync(token).ConfigureAwait(false);
        var items = json.RootElement.EnumerateArray().Select(item => MapJob(item, printerId, submissions)).ToArray();
        return new(offset, count, items.Length == count ? checked(offset + items.Length) : null, items);
    }

    public async Task<PrinterJob> HistoryJobAsync(string jobId, CancellationToken token)
    {
        if (!Guid.TryParse(jobId, out var id)) throw new ArgumentException("Printer job ID must be a UUID.");
        using var client = clients.Create();
        var printerId = await ReadPrinterIdAsync(client, token).ConfigureAwait(false);
        using var response = await client.GetAsync(new Uri("history/print_jobs/" + id.ToString("D"), UriKind.Relative), token).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound) throw new FileNotFoundException("Printer history job does not exist.");
        EnsureSuccess(response);
        using var json = await ReadResponseJsonAsync(response, token).ConfigureAwait(false);
        var result = MapJob(json.RootElement, printerId, await store.ReadSubmissionsAsync(token).ConfigureAwait(false));
        if (result.PrinterJobId != id.ToString("D")) throw new InvalidDataException("Printer returned a different history job UUID.");
        return result;
    }

    private static PrinterJob MapJob(JsonElement item, string printerId, IReadOnlyList<PrintSubmission> submissions)
    {
        if (!Guid.TryParse(Text(item, "uuid"), out var jobId))
            throw new InvalidDataException("Printer returned a job without a valid UUID.");
        var id = jobId.ToString("D");
        return new(printerId, id, Text(item, "name"), Text(item, "state"), Text(item, "result"),
            Text(item, "source"), Numeric(item, "progress", 1), Numeric(item, "time_elapsed"),
            Numeric(item, "time_estimated"), Numeric(item, "time_total"),
            Timestamp(item, "datetime_started"), Timestamp(item, "datetime_finished"),
            Timestamp(item, "datetime_cleaned"), submissions.Where(s => s.PrinterId == printerId && s.PrinterJobId == id).ToArray());
    }

    private static async Task<string> ReadPrinterIdAsync(HttpClient client, CancellationToken token)
    {
        using var json = await ReadJsonAsync(client, "system", token).ConfigureAwait(false);
        return PrinterIdFrom(json.RootElement);
    }

    private static string PrinterIdFrom(JsonElement system)
    {
        if (!Guid.TryParse(Text(system, "guid"), out var id))
            throw new InvalidDataException("Printer did not provide a valid system UUID; identity cannot be established.");
        return id.ToString("D");
    }

    private static string? Text(JsonElement item, string key)
        => item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static double? Numeric(JsonElement item, string key, double maximum = double.MaxValue)
    {
        if (!item.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var number)
            || !double.IsFinite(number) || number < 0 || number > maximum) return null;
        return number;
    }

    private static DateTimeOffset? Timestamp(JsonElement item, string key)
    {
        var text = Text(item, key);
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var timestamp))
            throw new InvalidDataException("Printer returned an invalid job timestamp.");
        return timestamp;
    }
}
