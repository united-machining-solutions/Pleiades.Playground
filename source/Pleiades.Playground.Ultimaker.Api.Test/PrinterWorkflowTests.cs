using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Ultimaker.Api.Test;

public sealed partial class UltimakerTests
{
    [TestMethod]
    public async Task HeaderValidationChecksExactArtifactWithoutPrintingOrEnablement()
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        using var disabled = new PrinterClient(fixture.Transport, fixture.Store,
            Options.Create(new UltimakerOptions { DataDirectory = fixture.DataDirectory, EnablePrinting = false }));
        var report = await disabled.ValidateHeaderAsync(slice.Id, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsTrue(report.Passed);
        Assert.AreEqual(slice.Id, report.SliceId);
        Assert.AreEqual(slice.Sha256, report.Sha256);
        Assert.Contains(";FLAVOR:Griffin", fixture.Transport.HeaderBody!, StringComparison.Ordinal);
        Assert.AreEqual(1, fixture.Transport.HeaderValidationCount);
        Assert.AreEqual(0, fixture.Transport.UploadCount);
    }

    [TestMethod]
    [DataRow("header-warning", "WARNING")]
    [DataRow("header-error", "ERROR")]
    [DataRow("header-unknown", "FUTURE_LEVEL")]
    public async Task PrinterHeaderFindingsBlockPrintAndRemainStructured(string scenario, string severity)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.Scenario = scenario;
        var report = await fixture.Printer.ValidateHeaderAsync(slice.Id, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsFalse(report.Passed);
        Assert.AreEqual(severity, report.Issues[0].FaultLevel);
        Assert.AreEqual("GUID_MISMATCH", report.Issues[0].FaultCode);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken)).ConfigureAwait(false);
        Assert.AreEqual(0, fixture.Transport.UploadCount);
        Assert.IsEmpty(await fixture.Store.ReadSubmissionsAsync(TestContext.CancellationToken).ConfigureAwait(false));
    }

    [TestMethod]
    public async Task AcceptedUploadHasDurableAssociationBeforeSendAndAfterRestart()
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.BeforeUpload = async () =>
        {
            var before = (await fixture.Store.ReadSubmissionsAsync(TestContext.CancellationToken).ConfigureAwait(false)).Single();
            Assert.AreEqual("uploading", before.State);
            Assert.AreEqual(slice.Sha256, before.Sha256);
            Assert.IsNull(before.PrinterJobId);
        };
        var accepted = await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken).ConfigureAwait(false);
        var options = Options.Create(new UltimakerOptions { DataDirectory = fixture.DataDirectory });
        var restartedStore = new ArtifactStore(options);
        using var restarted = new PrinterClient(fixture.Transport, restartedStore, options);
        var current = await restarted.CurrentJobAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(slice.Id, current.Job!.SliceAssociations.Single().SliceId);
        Assert.AreEqual(accepted.SubmissionId, current.Job.SliceAssociations.Single().Id);
        Assert.AreEqual("accepted", current.Job.SliceAssociations.Single().State);
        var history = await restarted.HistoryAsync(5, 1, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual("?offset=5&count=1", fixture.Transport.HistoryQuery);
        Assert.AreEqual(6, history.NextOffset);
        Assert.AreEqual(slice.Id, history.Items[0].SliceAssociations[0].SliceId);
        Assert.AreEqual(.4, history.Items[0].ProgressFraction);
        Assert.AreEqual(24, history.Items[0].TimeElapsedSecond);
        Assert.IsNull(history.Items[0].FinishedAt);
        var single = await restarted.HistoryJobAsync(accepted.PrinterJobId!, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(accepted.PrinterJobId, single.PrinterJobId);
        var prints = await restartedStore.SlicePrintsAsync(slice.Id, 0, 20, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(accepted.SubmissionId, prints.Items.Single().Id);
        Assert.IsNull(prints.NextOffset);
    }

    [TestMethod]
    [DataRow("upload-timeout")]
    [DataRow("missing-uuid")]
    public async Task AmbiguousUploadIsPersistedWithoutAutomaticRetry(string scenario)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.Scenario = scenario;
        try
        {
            await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken).ConfigureAwait(false);
            Assert.Fail("Expected ambiguous upload failure.");
        }
        catch (Exception error) when (error is HttpRequestException or InvalidDataException) { }
        var journal = await fixture.Store.SlicePrintsAsync(slice.Id, 0, 20, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual("unknown", journal.Items.Single().State);
        Assert.IsNull(journal.Items[0].PrinterJobId);
        Assert.AreEqual(1, fixture.Transport.UploadCount);
    }

    [TestMethod]
    [DataRow("external-job")]
    [DataRow("other-printer")]
    public async Task MatchingNamesOrJobsOnAnotherPrinterDoNotCreateAnAssociation(string scenario)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.Scenario = scenario;
        var current = await fixture.Printer.CurrentJobAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(current.Job!.SliceAssociations);
    }

    [TestMethod]
    [DataRow("current-missing")]
    [DataRow("current-none")]
    public async Task NoCurrentPrintIsRepresentedAsNull(string scenario)
    {
        using var fixture = new Fixture();
        fixture.Transport.Scenario = scenario;
        Assert.IsNull((await fixture.Printer.CurrentJobAsync(TestContext.CancellationToken).ConfigureAwait(false)).Job);
        fixture.Transport.Scenario = "history-empty";
        var page = await fixture.Printer.HistoryAsync(0, 20, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(page.Items);
        Assert.IsNull(page.NextOffset);
        fixture.Transport.Scenario = "history-missing";
        await Assert.ThrowsAsync<FileNotFoundException>(() => fixture.Printer.HistoryJobAsync(
            "966066fe-ce93-4b44-a6ba-a5dd2f532636", TestContext.CancellationToken)).ConfigureAwait(false);
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Printer.HistoryAsync(-1, 20, TestContext.CancellationToken)).ConfigureAwait(false);
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Printer.HistoryAsync(0, 101, TestContext.CancellationToken)).ConfigureAwait(false);
    }

    [TestMethod]
    public async Task RestAndMcpExposePrinterValidationCurrentHistoryAndSliceLinks()
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var slice = await fixture.AddSliceAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await fixture.Printer.StartAsync(new(slice.Id, slice.Sha256, "cube"), TestContext.CancellationToken).ConfigureAwait(false);
        using var parent = new WebApplicationFactory<Program>();
        await using var factory = parent.WithWebHostBuilder(host =>
        {
            host.UseSetting("Config:Auth:Enabled", "false");
            host.UseSetting("Ultimaker:DataDirectory", fixture.DataDirectory);
            host.ConfigureServices(services => services.AddSingleton<IPrinterHttpClientFactory>(fixture.Transport));
        });
        using var http = factory.CreateClient();
        using var validationResponse = await http.PostAsync($"/slices/{slice.Id}/printer-validation", null, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(HttpStatusCode.OK, validationResponse.StatusCode);
        var validation = await validationResponse.Content.ReadFromJsonAsync<PrinterHeaderValidation>(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsTrue(validation!.Passed);
        var current = await http.GetFromJsonAsync<CurrentPrinterJob>("/printer/print/current", TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(slice.Id, current!.Job!.SliceAssociations[0].SliceId);
        using var invalid = await http.GetAsync("/printer/print/history?count=101", TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(HttpStatusCode.BadRequest, invalid.StatusCode);
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
        foreach (var (tool, arguments) in new (string, Dictionary<string, object?>?)[]
        {
            ("ultimaker_slice_validate_header", new() { ["sliceId"] = slice.Id }),
            ("ultimaker_print_current", null),
            ("ultimaker_print_history", new() { ["count"] = 1 }),
            ("ultimaker_print_get", new() { ["printerJobId"] = "966066fe-ce93-4b44-a6ba-a5dd2f532636" }),
            ("ultimaker_slice_prints", new() { ["sliceId"] = slice.Id }),
        })
        {
            var result = await connection.Client.CallToolAsync(tool, arguments, cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
            Assert.IsFalse(result.IsError ?? false, string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text)));
            Assert.Contains(slice.Id, string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text)), StringComparison.Ordinal);
        }
        Assert.AreEqual(1, fixture.Transport.UploadCount);
    }
}
