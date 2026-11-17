using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mcp.Testing;

namespace Pleiades.Playground.JuiceBar.Api.Test;

[TestClass]
public sealed class JuiceBarTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void FramesOfSocketIoAreReadAndEverythingElseIsIgnored()
    {
        Assert.IsTrue(SocketIoFrame.TryParse("""42/production,["state","waitingOrder"]""", out var state));
        Assert.AreEqual("/production", state.Channel);
        Assert.AreEqual("state", state.Name);
        Assert.AreEqual("waitingOrder", state.Value.GetString());
        Assert.IsTrue(SocketIoFrame.TryParse("""4217["hello"]""", out var plain));
        Assert.AreEqual("/", plain.Channel);
        Assert.AreEqual(JsonValueKind.Undefined, plain.Value.ValueKind);
        foreach (var other in new[] { "3", "40/production", "42/production", "42/orders,{}", "42/orders,[1]", "42/orders,[" })
        {
            Assert.IsFalse(SocketIoFrame.TryParse(other, out _), other);
        }

        Assert.AreEqual("""42/orders,["room","allOrders"]""", SocketIoFrame.Emit("/orders", "room", "allOrders"));
        Assert.AreEqual(new Uri("ws://machine:3000/socket.io/?EIO=3&transport=websocket"),
            MixerLiveWorker.SocketUri("http://machine:3000/de/drinks"));
    }

    [TestMethod]
    public void TelemetryUsesBindingUnitsAndSaysNothingAboutAMachineThatDoesNotAnswer()
    {
        var live = new LiveState(TimeProvider.System);
        var now = DateTime.UtcNow;
        var silent = TelemetryMapper.Map(live.Snapshot(), now);
        Assert.HasCount(1, silent);
        Assert.AreEqual("Disconnected", ((StringValueDto)silent[0].Message).Value);

        live.Connected();
        Apply(live, """42/production,["state","processingOrder"]""");
        Apply(live, """42/production,["progress",40]""");
        Apply(live, """42/production,["queue",[{"orderNumber":3,"orderName":"A","drinkId":"d","queuePlace":0}]]""");
        Apply(live, """42/production,["warning",{"pumpNr":2}]""");
        Apply(live, """42/production,["amountWarning",{"pumpNr":"1","warningCleared":true}]""");
        Apply(live, """42/production,["unknown",{"x":1}]""");
        var values = TelemetryMapper.Map(live.Snapshot(), now).ToDictionary(s => s.Suffix, s => s.Message);
        var progress = (BaseUnitValueDto)values["vendor/JuiceBar/Production/Progress"];
        Assert.AreEqual(.4, progress.Value);
        Assert.AreEqual(BaseUnit.One, progress.Unit);
        Assert.AreEqual(now, progress.Timestamp);
        Assert.AreEqual(1, ((BaseUnitValueDto)values["vendor/JuiceBar/Production/QueueLength"]).Value);
        Assert.AreEqual("Executing", ((StringValueDto)values["umati/State/MachineryItemState"]).Value);
        Assert.IsTrue(((BooleanValueDto)values["vendor/JuiceBar/Pump/2/AmountWarning"]).Value);
        Assert.IsFalse(((BooleanValueDto)values["vendor/JuiceBar/Pump/1/AmountWarning"]).Value);

        // Progress belongs to the drink that is being mixed, and to nothing after it.
        Apply(live, """42/production,["state","waitingOrder"]""");
        Assert.IsNull(live.Snapshot().ProgressFraction);
        Apply(live, """42/production,["progress",100]""");
        Assert.IsNull(live.Snapshot().ProgressFraction);
        live.Disconnected();
        Assert.IsNull(live.Snapshot().ProductionState);
        Assert.IsEmpty(live.Snapshot().Queue);
    }

    [TestMethod]
    public async Task CardStatusAndOrdersReadTheMachineOverRestAndMcpAlike()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using var factory = Factory(machine);
        using var http = factory.CreateClient();
        await ConnectedAsync(http);

        var drinks = await http.GetFromJsonAsync<Drink[]>("/drinks", TestContext.CancellationToken);
        Assert.AreEqual("Tropical Mix", drinks!.Single().Title);
        Assert.AreEqual("language=en", drinks[0].Description);
        Assert.AreEqual(HttpStatusCode.NotFound, (await http.GetAsync(new Uri("/drinks/nope", UriKind.Relative), TestContext.CancellationToken)).StatusCode);

        var status = await http.GetFromJsonAsync<JuiceBarStatus>("/status", TestContext.CancellationToken);
        Assert.AreEqual("waitingOrder", status!.ProductionState);
        Assert.AreEqual("idle", status.PumpControlMode);
        Assert.IsTrue(status.OrderingEnabled);
        Assert.AreEqual(new Pump(1, "f6d361a9-5a6f-42ad-bff7-0913750809e4", "Orange Juice", 0.0015, false), status.Pumps[0]);
        Assert.AreEqual(new Pump(2, "unknown", null, 0.001, true), status.Pumps[1]);

        // The states of the orders come over a namespace of their own, a moment after the production.
        await UntilAsync(async () => (await http.GetFromJsonAsync<Order>("/orders/7", TestContext.CancellationToken))!.ProgressFraction is not null);
        var order = await http.GetFromJsonAsync<Order>("/orders/7", TestContext.CancellationToken);
        Assert.AreEqual("inProduction", order!.State);
        Assert.AreEqual(.4, order.ProgressFraction);
        Assert.AreEqual(HttpStatusCode.NotFound, (await http.GetAsync(new Uri("/orders/8", UriKind.Relative), TestContext.CancellationToken)).StatusCode);

        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);
        var tools = await connection.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);
        foreach (var name in new[] { "juicebar_drinks_list", "juicebar_drink_get", "juicebar_status", "juicebar_order_get", "juicebar_order_create" })
        {
            Assert.IsTrue(tools.Any(t => t.Name == name), name);
        }

        var listed = await connection.Client.CallToolAsync("juicebar_drinks_list", cancellationToken: TestContext.CancellationToken);
        Assert.Contains(FakeMixerControl.Tropical, string.Join("", listed.Content.OfType<TextContentBlock>().Select(c => c.Text)), StringComparison.Ordinal);
        Assert.IsEmpty(factory.Services.GetRequiredService<McpServerConventionReport>().Deviations);
        var violations = await McpConformance.CheckAsync(http, "juicebar", new McpConformanceOptions { RequireRestApi = true }, TestContext.CancellationToken);
        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));

        // Reading never writes: no request but GET went to the machine, and no frame but joins and pings.
        Assert.IsFalse(machine.Requests.Any(r => !r.StartsWith("GET ", StringComparison.Ordinal) && !r.StartsWith("WS ", StringComparison.Ordinal)));
        Assert.IsTrue(machine.Requests.Where(r => r.StartsWith("WS ", StringComparison.Ordinal))
            .All(r => r is "WS 2" or "WS 40/production" or "WS 40/orders" || r.Contains("""["room",""", StringComparison.Ordinal)));
    }

    [TestMethod]
    public async Task AnOrderIsPlacedOnceAndTheProductionIsNeverStarted()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using var factory = Factory(machine, ("JuiceBar:MaximumQueueLength", "2"));
        using var http = factory.CreateClient();
        await ConnectedAsync(http);

        var unknown = await http.PostAsJsonAsync("/orders", new OrderRequest("nope"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);

        var created = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Created, created.StatusCode);
        var order = await created.Content.ReadFromJsonAsync<Order>(TestContext.CancellationToken);
        Assert.AreEqual(100, order!.OrderNumber);
        Assert.AreEqual(JuiceBarService.StartButtonHint, order.NextStep);

        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);
        var second = await connection.Client.CallToolAsync("juicebar_order_create",
            new Dictionary<string, object?> { ["drinkId"] = FakeMixerControl.Tropical }, cancellationToken: TestContext.CancellationToken);
        Assert.AreNotEqual(true, second.IsError);
        await UntilAsync(async () => (await http.GetFromJsonAsync<JuiceBarStatus>("/status", TestContext.CancellationToken))!.Queue.Count == 2);
        Assert.AreEqual("waitForProduction", (await http.GetFromJsonAsync<Order>("/orders/101", TestContext.CancellationToken))!.State);

        // The queue is full now: REST answers 409 and the tool an error, and neither reaches the machine.
        var full = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Conflict, full.StatusCode);
        var refused = await connection.Client.CallToolAsync("juicebar_order_create",
            new Dictionary<string, object?> { ["drinkId"] = FakeMixerControl.Tropical }, cancellationToken: TestContext.CancellationToken);
        Assert.IsTrue(refused.IsError);

        Assert.AreEqual(2, machine.Requests.Count(r => r == "POST /api/orders"));
        Assert.IsFalse(machine.Requests.Any(r => r.StartsWith("PUT ", StringComparison.Ordinal) || r.StartsWith("DELETE ", StringComparison.Ordinal)
            || r.Contains("productionStart", StringComparison.OrdinalIgnoreCase)
            || (r.Contains("/api/admin/", StringComparison.Ordinal) && !r.StartsWith("GET ", StringComparison.Ordinal))));
    }

    [TestMethod]
    public async Task NoOrderIsPlacedWhileOrderingIsOffOrTheMachineIsNotReadyOrSilent()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using (var off = Factory(machine, ("JuiceBar:EnableOrdering", "false")))
        {
            using var http = off.CreateClient();
            await ConnectedAsync(http);
            Assert.IsFalse((await http.GetFromJsonAsync<JuiceBarStatus>("/status", TestContext.CancellationToken))!.OrderingEnabled);
            var refused = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.Conflict, refused.StatusCode);
        }

        machine.ProductionState = "pumpControlServiceMode";
        await using (var service = Factory(machine))
        {
            using var http = service.CreateClient();
            await ConnectedAsync(http);
            var refused = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.Conflict, refused.StatusCode);
        }

        // A machine that is switched off: the service stays alive, says so, and refuses the order.
        await using var silent = new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
        {
            host.UseSetting("Config:Auth:Enabled", "false");
            host.UseSetting("JuiceBar:BaseUrl", "http://127.0.0.1:9/");
        });
        using var client = silent.CreateClient();
        Assert.AreEqual(HttpStatusCode.OK, (await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        var health = await client.GetStringAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);
        Assert.Contains("Degraded", health, StringComparison.Ordinal);
        Assert.AreEqual(HttpStatusCode.BadGateway,
            (await client.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(HttpStatusCode.BadGateway, (await client.GetAsync(new Uri("/drinks", UriKind.Relative), TestContext.CancellationToken)).StatusCode);

        Assert.IsFalse(machine.Requests.Any(r => r == "POST /api/orders"));
    }

    private static WebApplicationFactory<Program> Factory(FakeMixerControl machine, params (string Key, string Value)[] settings)
        => new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
        {
            host.UseSetting("Config:Auth:Enabled", "false");
            host.UseSetting("JuiceBar:BaseUrl", machine.BaseUrl.ToString());
            foreach (var (key, value) in settings)
            {
                host.UseSetting(key, value);
            }
        });

    private Task ConnectedAsync(HttpClient http)
        => UntilAsync(async () =>
        {
            var status = await http.GetFromJsonAsync<JuiceBarStatus>("/status", TestContext.CancellationToken).ConfigureAwait(false);
            return status is { Connected: true, ProductionState: not null, PumpControlMode: not null } && status.Pumps.All(p => p.AmountWarning is not null);
        });

    private async Task UntilAsync(Func<Task<bool>> condition)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        while (!await condition().ConfigureAwait(false))
        {
            await Task.Delay(50, timeout.Token).ConfigureAwait(false);
        }
    }

    private static void Apply(LiveState live, string text)
    {
        Assert.IsTrue(SocketIoFrame.TryParse(text, out var frame), text);
        live.Apply(frame.Channel, frame.Name, frame.Value);
    }
}
