using System.Globalization;
using System.Text.Json;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed partial class PrinterClient
{
    private const int FailedJobHistoryCount = 20;

    /// <summary>
    /// The faults in the newest lines of the printer log and the failed or aborted jobs of its history.
    /// Read only, without pairing. The raw log never leaves this method: it names hosts and users.
    /// </summary>
    public async Task<PrinterFaultReport> FaultsAsync(CancellationToken token)
    {
        var lineCount = options.Value.FaultLogLines;
        using var client = clients.Create();
        var printerId = await ReadPrinterIdAsync(client, token).ConfigureAwait(false);
        using var log = await ReadJsonAsync(client,
            string.Create(CultureInfo.InvariantCulture, $"system/log?boot=0&lines={lineCount}"), token).ConfigureAwait(false);
        if (log.RootElement.ValueKind != JsonValueKind.Array)
            throw new HttpRequestException("Printer returned an invalid system log response.");
        var lines = log.RootElement.EnumerateArray()
            .Select(line => line.ValueKind == JsonValueKind.String ? line.GetString() : null).ToArray();
        var faults = PrinterFaultLog.Parse(lines).Reverse()
            .Select(fault => new PrinterFaultEntry(fault.RaisedAt, fault.Code, fault.Level, fault.Message)).ToArray();
        var history = await HistoryAsync(0, FailedJobHistoryCount, token).ConfigureAwait(false);
        var failed = history.Items.Where(job => job.Result is "Failed" or "Aborted").ToArray();
        return new(printerId, DateTimeOffset.UtcNow, lines.Length, PrinterFaultLog.Since(lines), faults, failed);
    }
}
