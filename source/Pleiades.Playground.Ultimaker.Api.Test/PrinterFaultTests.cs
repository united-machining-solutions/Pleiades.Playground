using System.Text.Json;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Api.Test;

// The log lines are those an Ultimaker 3 with firmware 5.3.0 wrote when its active levelling failed and a
// message stood on its display, with the host name replaced. The history is the one it reported then,
// without job and user names.
public sealed partial class UltimakerTests
{
    private const string FaultHistory = """
        [{"datetime_cleaned":"2026-11-17T20:18:48","datetime_finished":"2026-11-17T20:18:43","datetime_started":"2026-11-17T20:16:34",
          "name":"a","reprint_original_uuid":"19a2bb79-e661-43a2-bcc9-3c70e4339493","result":"Failed","source":"WEB_API",
          "time_elapsed":0.0,"time_estimated":0.0,"time_total":0,"uuid":"013e14bf-4829-4be6-a394-4a73221ecc7f"},
         {"datetime_cleaned":"2026-11-17T20:16:33","datetime_finished":"2026-11-17T20:15:52","datetime_started":"2026-11-17T19:49:48",
          "name":"a","reprint_original_uuid":null,"result":"Aborted","source":"WEB_API",
          "time_elapsed":0.0,"time_estimated":0.0,"time_total":0,"uuid":"19a2bb79-e661-43a2-bcc9-3c70e4339493"},
         {"datetime_cleaned":"2026-11-17T18:50:23","datetime_finished":"2026-11-17T18:10:02","datetime_started":"2026-11-17T17:38:26",
          "name":"b","reprint_original_uuid":null,"result":"Finished","source":"WEB_API",
          "time_elapsed":0.0,"time_estimated":0.0,"time_total":0,"uuid":"089d38d4-6e0a-4b52-aa3b-10ce1530d5ec"}]
        """;

    private static string FaultLog() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "system-log-fault-48.json"));

    [TestMethod]
    public async Task FaultsComeFromThePrinterLogAndFailedJobsFromItsHistory()
    {
        using var fixture = new Fixture();
        fixture.Transport.ResponseOverrides["/api/v1/system/log"] = FaultLog();
        fixture.Transport.ResponseOverrides["/api/v1/history/print_jobs"] = FaultHistory;
        var report = await fixture.Printer.FaultsAsync(TestContext.CancellationToken).ConfigureAwait(false);
        var fault = report.Faults.Single();
        Assert.AreEqual(48, fault.Code);
        Assert.AreEqual(4, fault.Level);
        Assert.AreEqual("The found Z-level 150.000 is not within the expected range [-30.000, 150.000]", fault.Message);
        Assert.AreEqual(new DateTimeOffset(2026, 11, 17, 20, 18, 20, 59, TimeSpan.Zero), fault.RaisedAt);
        Assert.AreEqual(new DateTimeOffset(2026, 11, 17, 20, 17, 41, TimeSpan.Zero), report.LogSince);
        Assert.AreEqual(38, report.LogLines);
        CollectionAssert.AreEqual(new[] { "Failed", "Aborted" }, report.FailedJobs.Select(job => job.Result).ToArray());
        Assert.AreEqual("013e14bf-4829-4be6-a394-4a73221ecc7f", report.FailedJobs[0].PrinterJobId);
        // The raw log names hosts; nothing of a line but the fault leaves the service.
        Assert.DoesNotContain("ultimakersystem", JsonSerializer.Serialize(report), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task LogWithoutFaultGivesAnEmptyListAndAnInvalidLogIsAnUpstreamError()
    {
        using var fixture = new Fixture();
        fixture.Transport.ResponseOverrides["/api/v1/system/log"] = """["Nov 17 20:00:00 host PrinterService[1]: 2026-11-17 20:00:00,001 INFO     procedure       nothing", 7, null]""";
        fixture.Transport.ResponseOverrides["/api/v1/history/print_jobs"] = "[]";
        var report = await fixture.Printer.FaultsAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(report.Faults);
        Assert.IsEmpty(report.FailedJobs);
        fixture.Transport.ResponseOverrides["/api/v1/system/log"] = """{"message":"Not found"}""";
        await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Printer.FaultsAsync(TestContext.CancellationToken)).ConfigureAwait(false);
    }

    [TestMethod]
    public void FaultLinesOfAnotherFormatAreSkippedAndRepeatedLinesCountOnce()
    {
        const string line = "Nov 17 20:18:20 host PrinterService[898]: 2026-11-17 20:18:20,059 WARNING  faultHandler    Added Fault: <Fault: level=4 code=48 message='It's a \u0007text' data='{}'>";
        var faults = PrinterFaultLog.Parse([line, line, null,
            "Nov 17 20:18:21 host PrinterService[898]: 2026-11-17 20:18:21,000 WARNING  faultHandler    Added Fault: <Fault: severity=high>",
            "Nov 17 20:18:22 host PrinterService[898]: 2026-13-45 20:18:22,000 WARNING  faultHandler    Added Fault: <Fault: level=1 code=2 message='x' data='{}'>",
            "Nov 17 20:18:19 host PrinterService[898]: 2026-11-17 20:18:19,000 WARNING  faultHandler    Added Fault: <Fault: level=2 code=7 message='" + new string('x', 400) + "' data='{}'>"]);
        Assert.HasCount(2, faults);
        Assert.AreEqual(7, faults[0].Code);
        Assert.AreEqual(PrinterFaultLog.MaximumMessageLength, faults[0].Message.Length);
        Assert.AreEqual("It's a text", faults[1].Message);
    }
}
