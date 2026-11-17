using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.Ultimaker.Api.Test;

public sealed partial class UltimakerTests
{
    [TestMethod]
    public async Task McpCanRepeatRejectedPairingWithoutReturningCredentials()
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.PairingState = "unauthorized";
        using var parent = new WebApplicationFactory<Program>();
        await using var factory = RecoveryFactory(parent, fixture);
        using var http = factory.CreateClient();
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
        var result = await connection.Client.CallToolAsync("ultimaker_printer_pair", new Dictionary<string, object?> { ["user"] = "Tester" },
            cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsFalse(result.IsError ?? false);
        var text = string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text));
        Assert.Contains("pending-display-approval", text, StringComparison.Ordinal);
        Assert.DoesNotContain("private-key", text, StringComparison.Ordinal);
        Assert.DoesNotContain("pair-id", text, StringComparison.Ordinal);
        Assert.AreEqual(2, fixture.Transport.PairingRequestCount);
    }

    [TestMethod]
    [DataRow("unauthorized", HttpStatusCode.OK)]
    [DataRow("unknown", HttpStatusCode.NotFound)]
    public async Task RejectedOrForgottenPairingCanBeRepeatedOverRest(string state, HttpStatusCode checkStatus)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.PairingState = state;
        fixture.Transport.PairingCheckStatus = checkStatus;
        using var parent = new WebApplicationFactory<Program>();
        await using var factory = RecoveryFactory(parent, fixture);
        using var http = factory.CreateClient();
        using var response = await http.PostAsJsonAsync("/printer/pair", new PairRequest("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("pending-display-approval", (await response.Content.ReadFromJsonAsync<PairStatus>(TestContext.CancellationToken).ConfigureAwait(false))!.State);
        Assert.AreEqual(2, fixture.Transport.PairingRequestCount);
        fixture.Transport.PairingState = "authorized";
        fixture.Transport.PairingCheckStatus = HttpStatusCode.OK;
        Assert.AreEqual("authorized", (await fixture.Printer.PairStatusAsync(TestContext.CancellationToken).ConfigureAwait(false)).State);
        using var credentials = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(fixture.DataDirectory, "printer-credentials.json"), TestContext.CancellationToken).ConfigureAwait(false));
        Assert.AreEqual("pair-id-2", credentials.RootElement.GetProperty("Id").GetString());
        Assert.AreEqual(0, fixture.Transport.UploadCount);
    }

    [TestMethod]
    [DataRow("authorized", HttpStatusCode.OK, false)]
    [DataRow("unknown", HttpStatusCode.OK, false)]
    [DataRow("future-state", HttpStatusCode.OK, true)]
    [DataRow("unauthorized", HttpStatusCode.ServiceUnavailable, true)]
    public async Task ExistingPairingIsPreservedUnlessRejectionIsConfirmed(string state, HttpStatusCode checkStatus, bool upstreamError)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var path = Path.Combine(fixture.DataDirectory, "printer-credentials.json");
        var before = await File.ReadAllBytesAsync(path, TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.PairingState = state;
        fixture.Transport.PairingCheckStatus = checkStatus;
        if (upstreamError)
            await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken)).ConfigureAwait(false);
        else
            await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken)).ConfigureAwait(false);
        CollectionAssert.AreEqual(before, await File.ReadAllBytesAsync(path, TestContext.CancellationToken).ConfigureAwait(false));
        Assert.AreEqual(1, fixture.Transport.PairingRequestCount);
    }

    [TestMethod]
    [DataRow("{}")]
    [DataRow("{\"id\":\"new-id\",\"key\":42}")]
    [DataRow("private-invalid-json")]
    public async Task InvalidReplacementCredentialsPreserveTheExistingFile(string payload)
    {
        using var fixture = new Fixture();
        await fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken).ConfigureAwait(false);
        var path = Path.Combine(fixture.DataDirectory, "printer-credentials.json");
        var before = await File.ReadAllBytesAsync(path, TestContext.CancellationToken).ConfigureAwait(false);
        fixture.Transport.PairingState = "unauthorized";
        fixture.Transport.ResponseOverrides["/api/v1/auth/request"] = payload;
        await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Printer.PairAsync(new("Tester"), TestContext.CancellationToken)).ConfigureAwait(false);
        CollectionAssert.AreEqual(before, await File.ReadAllBytesAsync(path, TestContext.CancellationToken).ConfigureAwait(false));
    }

    [TestMethod]
    [DataRow("/api/v1/printer", "{}")]
    [DataRow("/api/v1/printer", "{\"heads\":[]}")]
    [DataRow("/api/v1/printer", "{\"heads\":null}")]
    [DataRow("/api/v1/printer", "{\"heads\":[{\"extruders\":[]}]}")]
    [DataRow("/api/v1/printer", "{\"heads\":[{\"extruders\":[{\"hotend\":{\"id\":\"AA 0.4\",\"temperature\":{\"current\":\"private-data\"}},\"active_material\":{\"guid\":null}}]}]}")]
    [DataRow("/api/v1/system", "{\"variant\":42}")]
    [DataRow("/api/v1/system", "null")]
    [DataRow("/api/v1/system", "private-invalid-json")]
    public async Task MalformedPrinterStatusReturnsBadGatewayAndMcpError(string path, string payload)
    {
        using var fixture = new Fixture();
        fixture.Transport.ResponseOverrides[path] = payload;
        using var parent = new WebApplicationFactory<Program>();
        await using var factory = RecoveryFactory(parent, fixture);
        using var http = factory.CreateClient();
        using var response = await http.GetAsync("/printer", TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(HttpStatusCode.BadGateway, response.StatusCode);
        var detail = await response.Content.ReadAsStringAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.DoesNotContain("private-", detail, StringComparison.Ordinal);
        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
        var result = await connection.Client.CallToolAsync("ultimaker_printer_status", cancellationToken: TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsTrue(result.IsError ?? false);
        Assert.DoesNotContain("private-", string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text)), StringComparison.Ordinal);
        Assert.AreEqual(0, fixture.Transport.UploadCount);
    }

    private static WebApplicationFactory<Program> RecoveryFactory(WebApplicationFactory<Program> parent, Fixture fixture)
        => parent.WithWebHostBuilder(host =>
        {
            host.UseSetting("Config:Auth:Enabled", "false");
            host.UseSetting("Ultimaker:DataDirectory", fixture.DataDirectory);
            host.ConfigureServices(services => services.AddSingleton<IPrinterHttpClientFactory>(fixture.Transport));
        });
}
