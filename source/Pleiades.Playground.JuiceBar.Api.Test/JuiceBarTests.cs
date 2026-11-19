using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mcp.Testing;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Mqtt.Extensions.Testing;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api.Test;

[TestClass]
public sealed class JuiceBarTests
{
    private static readonly Dictionary<string, object?> TropicalOrder = new() { ["drinkId"] = FakeMixerControl.Tropical };

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
    public void TheMachineIdFollowsTheRuleOfTheBinding_AndTheDefaultsNameTheJuiceBarOfTheDemo()
    {
        var options = new JuiceBarOptions();
        // The juice bar of the demo, by default: the domain of TRUMPF without its ending.
        Assert.AreEqual("trumpf_JuiceBar_JUICEBAR-01", options.MachineId);
        Assert.AreEqual("https://www.trumpf.com/JuiceBar/JUICEBAR-01", options.Identity.EffectiveProductInstanceUri);
        Assert.AreEqual("x-trumpf-com", options.Identity.ExtensionPrefix);
        CollectionAssert.AreEqual(
            new[] { ("Identification.Manufacturer", "TRUMPF"), ("Identification.SerialNumber", "JUICEBAR-01"),
                ("Identification.ProductInstanceUri", "https://www.trumpf.com/JuiceBar/JUICEBAR-01"),
                ("Identification.ManufacturerUri", "https://www.trumpf.com"), ("Identification.Model", "JuiceBar") },
            options.Identity.Values(DateTimeOffset.UnixEpoch).Select(v => (v.Path, v.Value!.GetValue<string>())).ToArray());

        var named = new JuiceBarOptions { ManufacturerUri = "https://www.example-mixers.example", ManufacturerName = "Example Mixers", Model = "JB 8", SerialNumber = "0042" };
        Assert.AreEqual("example-mixers_JB-8_0042", named.MachineId);
    }

    [TestMethod]
    public void TelemetryUsesBindingUnitsAndTheSnapshotOfTheModel()
    {
        var live = new LiveState(TimeProvider.System);
        var identity = new JuiceBarOptions().Identity;
        var now = DateTimeOffset.UtcNow;
        live.Connected();
        Apply(live, """42/production,["state","processingOrder"]""");
        Apply(live, """42/production,["progress",40]""");
        Apply(live, """42/production,["queue",[{"orderNumber":3,"orderName":"A","drinkId":"d","queuePlace":0}]]""");
        Apply(live, """42/production,["warning",{"pumpNr":2}]""");
        Apply(live, """42/production,["amountWarning",{"pumpNr":"1","warningCleared":true}]""");
        Apply(live, """42/production,["unknown",{"x":1}]""");
        var values = TelemetryMapper.Map(live.Snapshot(), now, identity)
            .ToDictionary(v => MachineBinding.Topic(identity.MachineId, v.Path)["machines/trumpf_JuiceBar_JUICEBAR-01/".Length..]);
        // What the data model does not know lies in the namespace oem, and nothing in the earlier vendor.
        Assert.IsFalse(values.Keys.Any(topic => topic.StartsWith("vendor/", StringComparison.Ordinal)));
        var progress = values["oem/JuiceBar/Production/Progress"];
        Assert.AreEqual(.4, progress.Value!.GetValue<double>());
        Assert.AreEqual("one", progress.Unit);
        Assert.AreEqual(now, progress.Timestamp);
        Assert.AreEqual(1, values["oem/JuiceBar/Production/QueueLength"].Value!.GetValue<int>());
        // The state is the snapshot State/Status of the model, one topic, not a value on a field topic.
        Assert.AreEqual("Executing", values["umati/State/Status"].Value!["MachineryItemState"]!.GetValue<string>());
        Assert.AreEqual("None", values["umati/State/Status"].Value!["MachineryOperationMode"]!.GetValue<string>());
        Assert.IsFalse(values.ContainsKey("umati/State/Status/MachineryItemState"));
        Assert.IsTrue(values["oem/JuiceBar/Pump/2/AmountWarning"].Value!.GetValue<bool>());
        Assert.IsFalse(values["oem/JuiceBar/Pump/1/AmountWarning"].Value!.GetValue<bool>());
        foreach (var unit in values.Values.Select(v => v.Unit).OfType<string>())
        {
            Assert.IsNotNull(JsonSerializer.Deserialize<BaseUnit?>("\"" + unit + "\""), unit);
        }

        var manifest = TelemetryMapper.Manifest(identity, TimeSpan.FromSeconds(10), [.. TelemetryMapper.Signals, TelemetryMapper.PumpWarning(1), TelemetryMapper.PumpWarning(2)]);
        ModelSchemas.AssertManifestValid(manifest);
        ModelSchemas.AssertValuesValid(values.Values.Select(v => MachineBinding.ValueMessage(identity.MachineId, v)), identity.MachineId, manifest);

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
    public async Task TheAdapterSaysCommunicationFaultWhileTheMachineIsSilent_AndNamesANewPumpInTheManifestBeforeItsValue()
    {
        using var mqtt = new RecordingManagedMqttClient();
        var live = new LiveState(TimeProvider.System);
        var options = new JuiceBarOptions();
        var identity = options.Identity;
        using var worker = new TelemetryWorker(mqtt, live, Options.Create(options), TimeProvider.System, NullLogger<TelemetryWorker>.Instance);
        using var publisher = new MachinePublisher(mqtt, identity, TelemetryMapper.Manifest(identity, TimeSpan.FromSeconds(10), TelemetryMapper.Signals),
            TimeProvider.System, NullLogger.Instance);
        await publisher.AttachAsync();

        await worker.PublishAsync(publisher, identity, live.Snapshot(), DateTimeOffset.UtcNow);
        var silent = mqtt.Take();
        Assert.AreEqual("Initializing", (string?)RecordingManagedMqttClient.Json(silent[0])["value"]);
        Assert.AreEqual("CommunicationFault", (string?)RecordingManagedMqttClient.Json(silent[^1])["value"]);
        Assert.IsFalse(silent.Any(m => m.Topic.Contains("/oem/", StringComparison.Ordinal)), "nothing is said about a machine that does not answer");

        live.Connected();
        Apply(live, """42/production,["state","waitingOrder"]""");
        Apply(live, """42/production,["warning",{"pumpNr":3}]""");
        await worker.PublishAsync(publisher, identity, live.Snapshot(), DateTimeOffset.UtcNow);
        var reached = mqtt.Take();
        var manifest = reached.FindIndex(m => m.Topic.EndsWith("/umati/Manifest", StringComparison.Ordinal));
        var pump = reached.FindIndex(m => m.Topic.EndsWith("/oem/JuiceBar/Pump/3/AmountWarning", StringComparison.Ordinal));
        Assert.IsTrue(manifest >= 0 && manifest < pump, "the manifest names the pump before its value goes out");
        Assert.AreEqual("Running", (string?)RecordingManagedMqttClient.Json(reached[^1])["value"]);
        ModelSchemas.AssertManifestValid(RecordingManagedMqttClient.Json(reached[manifest]));
        ModelSchemas.AssertValuesValid(reached, identity.MachineId, RecordingManagedMqttClient.Json(reached[manifest]));
    }

    [TestMethod]
    public async Task WithABrokerTheServicePublishesWhatTheMachineSaysAsTheBindingSays()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        using var mqtt = new RecordingManagedMqttClient();
        await using var factory = new JuiceBarFactory(machine.BaseUrl, ("Config:MqttDestination:ConnectionString", "mqtt://127.0.0.1:1")) { Mqtt = mqtt };
        using var http = factory.CreateClient();
        await ConnectedAsync(http);
        const string Machine = "machines/trumpf_JuiceBar_JUICEBAR-01/";
        await UntilAsync(() => Task.FromResult(mqtt.Messages.Any(m => m.Topic == Machine + "oem/JuiceBar/Pump/2/AmountWarning")
            && mqtt.Messages.Any(m => m.Topic == Machine + "umati/Connection/State" && (string?)RecordingManagedMqttClient.Json(m)["value"] == "Running")));

        var messages = mqtt.Messages.ToList();
        Assert.IsTrue(messages.All(m => m.Retain && m.QualityOfServiceLevel == MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce && m.ContentType == "application/json"));
        Assert.AreEqual("Initializing", (string?)RecordingManagedMqttClient.Json(messages[0])["value"]);
        var status = RecordingManagedMqttClient.Json(messages.Last(m => m.Topic == Machine + "umati/State/Status"));
        Assert.AreEqual("NotExecuting", status["value"]!["MachineryItemState"]!.GetValue<string>());
        Assert.IsTrue(RecordingManagedMqttClient.Json(messages.Last(m => m.Topic == Machine + "oem/JuiceBar/Pump/2/AmountWarning"))["value"]!.GetValue<bool>());
        var manifest = RecordingManagedMqttClient.Json(messages.Last(m => m.Topic == Machine + "umati/Manifest"));
        ModelSchemas.AssertValuesValid(messages, "trumpf_JuiceBar_JUICEBAR-01", manifest);
        // The last will of the binding is set on the client.
        Assert.AreEqual(Machine + "umati/Connection/State", mqtt.Options!.ClientOptions.WillTopic);
        Assert.IsTrue(mqtt.Options.ClientOptions.WillRetain);
        Assert.IsFalse(machine.Requests.Any(r => r.StartsWith("POST", StringComparison.Ordinal)), "the adapter only reads");
    }

    [TestMethod]
    public void AnOrderPlacedHereCountsAsWaitingUntilTheMachineListsItOrItFails()
    {
        var live = new LiveState(TimeProvider.System);
        live.Connected();
        live.Placed(4);
        live.Placed(5);
        live.Placed(6);
        Assert.AreEqual(3, live.PlacedNotQueued());

        Apply(live, """42/production,["queue",[{"orderNumber":4,"queuePlace":0}]]""");
        Assert.AreEqual(2, live.PlacedNotQueued());
        Apply(live, """42/orders,["state",{"orderNumber":5,"toState":"error"}]""");
        Assert.AreEqual(1, live.PlacedNotQueued());

        // An order the machine lists already is not counted twice.
        live.Placed(4);
        Assert.AreEqual(1, live.PlacedNotQueued());
        live.Disconnected();
        Assert.AreEqual(0, live.PlacedNotQueued());
    }

    [TestMethod]
    public async Task CardStatusAndOrdersReadTheMachineOverRestAndMcpAlike()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using var factory = new JuiceBarFactory(machine.BaseUrl);
        using var http = factory.CreateClient();
        await ConnectedAsync(http);

        var drinks = await GetAsync<Drink[]>(http, "/drinks");
        Assert.AreEqual("Tropical Mix", drinks.Single().Title);
        Assert.AreEqual("language=en", drinks[0].Description);
        // What the author chose in the marketplace, and each ingredient with its colour and its bottle.
        Assert.AreEqual("#ff9900", drinks[0].Color);
        Assert.AreEqual("_22", drinks[0].Picture);
        Assert.AreEqual(new DrinkComponent(FakeMixerControl.Orange, "Orange Juice", "#ff9900", false), drinks[0].Components[0]);
        Assert.AreEqual(new DrinkComponent("unknown", "Mystery", null, true), drinks[0].Components[1]);
        Assert.AreEqual(HttpStatusCode.NotFound, (await http.GetAsync(new Uri("/drinks/nope", UriKind.Relative), TestContext.CancellationToken)).StatusCode);

        var status = await GetAsync<JuiceBarStatus>(http, "/status");
        Assert.AreEqual("waitingOrder", status.ProductionState);
        Assert.AreEqual("idle", status.PumpControlMode);
        Assert.IsTrue(status.OrderingEnabled);
        Assert.AreEqual(new Pump(1, "f6d361a9-5a6f-42ad-bff7-0913750809e4", "Orange Juice", 0.0015, false), status.Pumps[0]);
        Assert.AreEqual(new Pump(2, "unknown", null, 0.001, true), status.Pumps[1]);

        // The states of the orders come over a namespace of their own, a moment after the production.
        await UntilAsync(async () => (await GetAsync<Order>(http, "/orders/7")).ProgressFraction is not null);
        var order = await GetAsync<Order>(http, "/orders/7");
        Assert.AreEqual("inProduction", order.State);
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
    public async Task TheUseOfTheIngredientsComesFromTheReportOfTheMarketplaceOverRestAndMcpAlike()
    {
        var ct = TestContext.CancellationToken;
        await using var machine = await FakeMixerControl.StartAsync(ct);
        await using (var nameless = new JuiceBarFactory(machine.BaseUrl))
        {
            // Without a marketplace the use is not known, and the service says why instead of counting nothing.
            using var http = nameless.CreateClient();
            Assert.AreEqual(HttpStatusCode.Conflict, (await http.GetAsync(new Uri("/consumption", UriKind.Relative), ct)).StatusCode);
        }

        await using var factory = new JuiceBarFactory(machine.BaseUrl, ("JuiceBar:MarketplaceUrl", machine.BaseUrl.ToString()));
        using var client = factory.CreateClient();
        await ConnectedAsync(client);

        var used = await GetAsync<Consumption>(client, "/consumption?hours=3");
        Assert.AreEqual(3, used.Hours);
        Assert.AreEqual(TimeSpan.FromHours(3), used.To - used.From);
        var orange = used.Ingredients[0];
        Assert.AreEqual(FakeMixerControl.Orange, orange.ComponentId);
        Assert.AreEqual("Orange Juice", orange.Name);
        Assert.AreEqual("#ff9900", orange.Color);
        Assert.AreEqual(1, orange.Pumps.Single());
        Assert.AreEqual(17, orange.DrinksSinceStart);
        Assert.AreEqual(2, orange.DrinksInHours);
        // The ingredient of pump 2 has no name, so the report cannot say its use, and so the least used is not known.
        Assert.AreEqual("unknown", used.Ingredients[1].ComponentId);
        Assert.IsNull(used.Ingredients[1].DrinksSinceStart);
        Assert.IsNull(used.LeastUsedId);
        Assert.Contains("not known", used.Summary, StringComparison.Ordinal);
        Assert.Contains("marketplace", used.Source, StringComparison.Ordinal);
        Assert.AreEqual(HttpStatusCode.BadRequest, (await client.GetAsync(new Uri("/consumption?hours=25", UriKind.Relative), ct)).StatusCode);

        await using var connection = await McpTestClient.ConnectAsync(client, cancellationToken: ct);
        var result = await connection.Client.CallToolAsync("juicebar_consumption_get", new Dictionary<string, object?> { ["hours"] = 3 },
            cancellationToken: ct);
        Assert.IsFalse(result.IsError ?? false);
        Assert.Contains("Orange Juice", string.Join("", result.Content.OfType<TextContentBlock>().Select(c => c.Text)), StringComparison.Ordinal);

        // Reading never writes, neither at the machine nor at the marketplace.
        Assert.IsTrue(machine.Requests.Contains("GET /api/reports/components/top"));
        Assert.IsFalse(machine.Requests.Any(r => !r.StartsWith("GET ", StringComparison.Ordinal) && !r.StartsWith("WS ", StringComparison.Ordinal)));
    }

    [TestMethod]
    public async Task AnOrderIsPlacedOnceAndTheProductionIsNeverStarted()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using var factory = new JuiceBarFactory(machine.BaseUrl, ("JuiceBar:MaximumQueueLength", "2"));
        using var http = factory.CreateClient();
        await ConnectedAsync(http);

        var unknown = await http.PostAsJsonAsync("/orders", new OrderRequest("nope"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);

        var created = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Created, created.StatusCode);
        var order = await created.Content.ReadFromJsonAsync<Order>(TestContext.CancellationToken);
        Assert.IsNotNull(order);
        Assert.AreEqual(100, order.OrderNumber);
        Assert.AreEqual(JuiceBarService.StartButtonHint, order.NextStep);

        await using var connection = await McpTestClient.ConnectAsync(http, cancellationToken: TestContext.CancellationToken);
        var second = await connection.Client.CallToolAsync("juicebar_order_create", TropicalOrder, cancellationToken: TestContext.CancellationToken);
        Assert.AreNotEqual(true, second.IsError);

        // The queue is full at once, before the machine lists the two orders: REST answers 409 and the tool an
        // error, and neither reaches the machine.
        var full = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Conflict, full.StatusCode);
        var refused = await connection.Client.CallToolAsync("juicebar_order_create", TropicalOrder, cancellationToken: TestContext.CancellationToken);
        Assert.IsTrue(refused.IsError);

        await UntilAsync(async () => (await GetAsync<JuiceBarStatus>(http, "/status")).Queue.Count == 2);
        Assert.AreEqual("waitForProduction", (await GetAsync<Order>(http, "/orders/101")).State);
        Assert.AreEqual(HttpStatusCode.Conflict,
            (await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);

        Assert.AreEqual(2, machine.Requests.Count(r => r == "POST /api/orders"));
        Assert.IsFalse(machine.Requests.Any(r => r.StartsWith("PUT ", StringComparison.Ordinal) || r.StartsWith("DELETE ", StringComparison.Ordinal)
            || r.Contains("productionStart", StringComparison.OrdinalIgnoreCase)
            || (r.Contains("/api/admin/", StringComparison.Ordinal) && !r.StartsWith("GET ", StringComparison.Ordinal))));
    }

    [TestMethod]
    public async Task TheQueueLimitHoldsWhenOrdersComeAtOnceOrFasterThanTheMachineListsThem()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        machine.EnqueueDelay = TimeSpan.FromMilliseconds(400);
        await using var factory = new JuiceBarFactory(machine.BaseUrl, ("JuiceBar:MaximumQueueLength", "2"));
        using var http = factory.CreateClient();
        await ConnectedAsync(http);

        var answers = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ =>
            http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)));
        Assert.AreEqual(2, answers.Count(a => a.StatusCode == HttpStatusCode.Created));
        Assert.AreEqual(4, answers.Count(a => a.StatusCode == HttpStatusCode.Conflict));

        // One after the other, each before the machine has listed the one before.
        for (var i = 0; i < 3; i++)
        {
            var late = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.Conflict, late.StatusCode);
        }

        Assert.AreEqual(2, machine.Requests.Count(r => r == "POST /api/orders"));
    }

    [TestMethod]
    public async Task NoOrderIsPlacedWhileOrderingIsOffOrTheMachineIsNotReadyOrSilent()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using (var off = new JuiceBarFactory(machine.BaseUrl, ("JuiceBar:EnableOrdering", "false")))
        {
            using var http = off.CreateClient();
            await ConnectedAsync(http);
            Assert.IsFalse((await GetAsync<JuiceBarStatus>(http, "/status")).OrderingEnabled);
            var refused = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.Conflict, refused.StatusCode);
        }

        machine.ProductionState = "pumpControlServiceMode";
        await using (var service = new JuiceBarFactory(machine.BaseUrl))
        {
            using var http = service.CreateClient();
            await ConnectedAsync(http);
            var refused = await http.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.Conflict, refused.StatusCode);
        }

        // A machine that is switched off: the service stays alive, says so in its status, and refuses the order.
        await using var silent = new JuiceBarFactory(new Uri("http://127.0.0.1:9/"));
        using var client = silent.CreateClient();
        Assert.AreEqual(HttpStatusCode.OK, (await client.GetAsync(new Uri("/health", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        var health = await client.GetStringAsync(new Uri("/healthcheck", UriKind.Relative), TestContext.CancellationToken);
        Assert.Contains("Degraded", health, StringComparison.Ordinal);
        var status = await GetAsync<JuiceBarStatus>(client, "/status");
        Assert.IsFalse(status.Connected);
        Assert.IsNull(status.ProductionState);
        Assert.IsEmpty(status.Pumps);
        Assert.AreEqual(HttpStatusCode.BadGateway,
            (await client.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(HttpStatusCode.BadGateway, (await client.GetAsync(new Uri("/drinks", UriKind.Relative), TestContext.CancellationToken)).StatusCode);

        Assert.IsFalse(machine.Requests.Any(r => r == "POST /api/orders"));
    }

    [TestMethod]
    public async Task WithSignInOnAnOrderNeedsTheWritePermissionAndReadingTheReadPermission()
    {
        await using var machine = await FakeMixerControl.StartAsync(TestContext.CancellationToken);
        await using var factory = new JuiceBarFactory(machine.BaseUrl) { SignIn = true };
        using var anonymous = factory.CreateClient();
        using var reader = factory.CreateClient();
        reader.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", JuiceBarFactory.Token("juicebar:read"));
        using var writer = factory.CreateClient();
        writer.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", JuiceBarFactory.Token("juicebar:write"));
        await ConnectedAsync(reader);

        Assert.AreEqual(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(new Uri("/drinks", UriKind.Relative), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);

        Assert.HasCount(1, await GetAsync<Drink[]>(reader, "/drinks"));
        Assert.AreEqual(HttpStatusCode.Forbidden,
            (await reader.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);

        // The tool is guarded like the route: with the read permission it is not offered, or it refuses.
        await using (var connection = await McpTestClient.ConnectAsync(reader, cancellationToken: TestContext.CancellationToken))
        {
            var tools = await connection.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);
            Assert.IsTrue(tools.Any(t => t.Name == "juicebar_drinks_list"));
            var ordered = false;
            try
            {
                var result = await connection.Client.CallToolAsync("juicebar_order_create", TropicalOrder, cancellationToken: TestContext.CancellationToken);
                ordered = result.IsError != true;
            }
            catch (McpException)
            {
                // Refused by the server.
            }

            Assert.IsFalse(ordered);
        }

        Assert.IsFalse(machine.Requests.Any(r => r == "POST /api/orders"));
        Assert.AreEqual(HttpStatusCode.Created,
            (await writer.PostAsJsonAsync("/orders", new OrderRequest(FakeMixerControl.Tropical), TestContext.CancellationToken)).StatusCode);
        Assert.AreEqual(1, machine.Requests.Count(r => r == "POST /api/orders"));
    }

    private async Task<T> GetAsync<T>(HttpClient http, string path)
    {
        var value = await http.GetFromJsonAsync<T>(path, TestContext.CancellationToken);
        Assert.IsNotNull(value);
        return value;
    }

    private Task ConnectedAsync(HttpClient http)
        => UntilAsync(async () =>
        {
            var status = await GetAsync<JuiceBarStatus>(http, "/status");
            return status is { Connected: true, ProductionState: not null, PumpControlMode: not null }
                && status.Pumps.Count > 0 && status.Pumps.All(p => p.AmountWarning is not null);
        });

    private async Task UntilAsync(Func<Task<bool>> condition)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        while (!await condition())
        {
            await Task.Delay(50, timeout.Token);
        }
    }

    private static void Apply(LiveState live, string text)
    {
        Assert.IsTrue(SocketIoFrame.TryParse(text, out var frame), text);
        live.Apply(frame.Channel, frame.Name, frame.Value);
    }

    /// <summary>The service against one machine, without sign-in unless a test switches it on.</summary>
    private sealed class JuiceBarFactory(Uri machine, params (string Key, string Value)[] settings) : WebApplicationFactory<Program>
    {
        private const string Issuer = "https://issuer.test";
        private const string Audience = "juicebar-test";
        private static readonly SymmetricSecurityKey Key = new(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

        /// <summary>Sign-in on: tokens of <see cref="Token"/> are accepted, and nothing is fetched from an identity provider.</summary>
        internal bool SignIn { get; init; }

        internal static string Token(string role) => new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            Subject = new ClaimsIdentity([new Claim("roles", role), new Claim("preferred_username", "test")]),
            Expires = DateTime.UtcNow.AddMinutes(5),
            SigningCredentials = new SigningCredentials(Key, SecurityAlgorithms.HmacSha256),
        });

        /// <summary>A broker without a broker: the service publishes to it once a connection string is set.</summary>
        internal RecordingManagedMqttClient? Mqtt { get; init; }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            if (Mqtt is { } mqtt)
            {
                builder.ConfigureTestServices(services =>
                {
                    services.AddKeyedSingleton<IManagedMqttClient>("default", mqtt);
                    services.AddSingleton<IManagedMqttClient>(mqtt);
                });
            }

            builder.UseSetting("JuiceBar:BaseUrl", machine.ToString());
            builder.UseSetting("Config:Auth:Enabled", SignIn ? "true" : "false");
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }

            if (!SignIn)
            {
                return;
            }

            builder.UseSetting("Config:Auth:MetadataAddress", Issuer + "/.well-known/openid-configuration");
            builder.UseSetting("Config:Auth:ValidIssuer", Issuer);
            builder.UseSetting("Config:Auth:Audience", Audience);
            builder.ConfigureTestServices(services => services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, jwt =>
            {
                // The key of the test stands in for the keys of an identity provider.
                jwt.ConfigurationManager = null;
                jwt.TokenValidationParameters.IssuerSigningKey = Key;
            }));
        }
    }
}
