using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Mqtt.Extensions.Testing;

namespace Pleiades.Playground.Ultimaker.Telemetry.Test;

[TestClass]
public sealed class TelemetryTests
{
    public TestContext TestContext { get; set; } = null!;
    private const string Machine = "machines/ultimaker_UM3_UM3-01/";
    private const string Snapshot = """
        {"status":"printing","bed":{"temperature":{"current":60.5,"target":60}},
         "heads":[{"position":{"x":120,"y":100,"z":1.2},"fan":50,"extruders":[
           {"hotend":{"temperature":{"current":200,"target":205}},"active_material":{"length_remaining":1000}},
           {"hotend":{"temperature":{"current":30,"target":0}},"active_material":{"length_remaining":-1}}]}]}
        """;
    private const string Job = """{"state":"printing","uuid":"a-job","result":"","progress":0.25,"time_elapsed":10,"time_total":40}""";

    private static readonly MachineIdentity Identity = new TelemetryOptions().Identity;

    [TestMethod]
    public void TheDefaultsGiveTheMachineIdOfThePrinter_ByTheRuleOfTheBinding()
    {
        var options = new TelemetryOptions();
        Assert.AreEqual("ultimaker_UM3_UM3-01", options.MachineId);
        Assert.AreEqual("https://ultimaker.com/UM3/UM3-01", options.Identity.EffectiveProductInstanceUri);
        Assert.AreEqual("x-ultimaker-com", options.Identity.ExtensionPrefix);
        Assert.AreEqual("ultimaker_UM3_UM3-02", new TelemetryOptions { SerialNumber = "UM3-02" }.MachineId);
    }

    [TestMethod]
    public void SnapshotsUseBindingUnitsAndOmitUnknownMaterialLengths()
    {
        using var printer = JsonDocument.Parse(Snapshot);
        using var job = JsonDocument.Parse(Job);
        var now = DateTimeOffset.UtcNow;
        var values = TelemetryMapper.Map(printer.RootElement, job.RootElement, now, Identity).ToDictionary(v => MachineBinding.Topic(Identity.MachineId, v.Path)[Machine.Length..]);
        var temperature = values["oem/Ultimaker/Bed/Temperature"];
        Assert.AreEqual(60.5, temperature.Value!.GetValue<double>());
        Assert.AreEqual("degreeCelsius", temperature.Unit);
        Assert.AreEqual(now, temperature.Timestamp);
        Assert.AreEqual(.12, values["oem/Ultimaker/Position/X"].Value!.GetValue<double>());
        Assert.AreEqual("metre", values["oem/Ultimaker/Position/X"].Unit);
        Assert.AreEqual(.5, values["oem/Ultimaker/FanFraction"].Value!.GetValue<double>());
        Assert.AreEqual(1, values["oem/Ultimaker/Extruder/0/MaterialRemainingLength"].Value!.GetValue<double>());
        Assert.IsFalse(values.ContainsKey("oem/Ultimaker/Extruder/1/MaterialRemainingLength"));
        // The state is the snapshot State/Status of the model, not a value on a field topic.
        Assert.IsFalse(values.ContainsKey("umati/State/Status/MachineryItemState"));
        var status = values["umati/State/Status"].Value!.AsObject();
        Assert.AreEqual("Executing", status["MachineryItemState"]!.GetValue<string>());
        Assert.AreEqual("None", status["MachineryOperationMode"]!.GetValue<string>());
        Assert.IsNull(values["umati/State/Status"].Unit);
        // Every unit is one the store knows.
        foreach (var unit in values.Values.Select(v => v.Unit).OfType<string>())
        {
            Assert.IsNotNull(JsonSerializer.Deserialize<BaseUnit?>($"\"{unit}\""), unit);
        }
    }

    [TestMethod]
    public void NoJobOrUnknownValuesNeverBecomeInventedZeroProgressOrMachineStates()
    {
        using var printer = JsonDocument.Parse("""{"status":"future_status","bed":{"temperature":{"current":null}}}""");
        var values = TelemetryMapper.Map(printer.RootElement, null, DateTimeOffset.UtcNow, Identity);
        Assert.IsFalse(values.Any(v => v.Value is JsonValue n && n.GetValueKind() == JsonValueKind.Number));
        Assert.AreEqual("OutOfService", values.Single(v => v.Path == "State.Status").Value!["MachineryItemState"]!.GetValue<string>(),
            "a printer that answers in a state the model has no word for is out of service, never null");
        Assert.AreEqual("none", values.Single(v => v.Path == "x-ultimaker-com.Ultimaker.Print.State").Value!.GetValue<string>());
        using var job = JsonDocument.Parse("""{"state":"paused","progress":-1,"time_elapsed":null,"time_total":-1}""");
        values = TelemetryMapper.Map(printer.RootElement, job.RootElement, DateTimeOffset.UtcNow, Identity);
        Assert.IsFalse(values.Any(v => v.Value is JsonValue n && n.GetValueKind() == JsonValueKind.Number));
        Assert.AreEqual("NotExecuting", values.Single(v => v.Path == "State.Status").Value!["MachineryItemState"]!.GetValue<string>());
    }

    [TestMethod]
    public void TheManifestNamesEverySignalTheMapperGives_AndTheSchemaOfTheModelTakesIt()
    {
        using var printer = JsonDocument.Parse(Snapshot);
        using var job = JsonDocument.Parse(Job);
        var manifest = TelemetryMapper.Manifest(Identity, TimeSpan.FromSeconds(10), TelemetryMapper.Signals(TelemetryMapper.DefaultExtruders));
        var named = manifest["elements"]!.AsArray().Select(e => e!["path"]!.GetValue<string>()).ToHashSet();
        var values = TelemetryMapper.Map(printer.RootElement, job.RootElement, DateTimeOffset.UtcNow, Identity);
        foreach (var value in values)
        {
            Assert.Contains(value.Path, named);
        }
        CollectionAssert.AreEqual(new[] { "Core" }, manifest["profiles"]!.AsArray().Select(p => p!.GetValue<string>()).ToArray());
        Assert.AreEqual("ultimaker_UM3_UM3-01", manifest["machineId"]!.GetValue<string>());
        ModelSchemas.AssertManifestValid(manifest);
        ModelSchemas.AssertValuesValid(values.Select(v => MachineBinding.ValueMessage(Identity.MachineId, v)), Identity.MachineId, manifest);
    }

    [TestMethod]
    public async Task WhileThePrinterRequestIsBlocked_TheAdapterSaysInitializing_TheManifest_AndItsHeartbeat()
    {
        using var mqtt = new RecordingManagedMqttClient();
        using var handler = new BlockedPrinter();
        using var worker = Worker(mqtt, handler);
        await worker.StartAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await UntilAsync(() => mqtt.Messages.Any(m => m.Topic.EndsWith("/Connection/Heartbeat", StringComparison.Ordinal))).ConfigureAwait(false);
        var messages = mqtt.Messages.ToList();
        Assert.IsTrue(messages.All(m => m.Retain && m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce && m.ContentType == "application/json"));
        Assert.IsTrue(messages.All(m => m.Topic.StartsWith(Machine, StringComparison.Ordinal)));
        Assert.AreEqual(Machine + "umati/Connection/State", messages[0].Topic);
        Assert.AreEqual("Initializing", Text(messages[0]));
        Assert.AreEqual(Machine + "umati/Manifest", messages[1].Topic);
        Assert.AreEqual("UM3", Text(messages.Single(m => m.Topic == Machine + "umati/Identification/Model")));
        Assert.AreEqual("https://ultimaker.com/UM3/UM3-01", Text(messages.Single(m => m.Topic == Machine + "umati/Identification/ProductInstanceUri")));
        Assert.IsFalse(messages.Any(m => m.Topic.Contains("/Temperature", StringComparison.Ordinal)));
        Assert.AreEqual(1, messages.Count(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)), "no state until the printer answers");
        var heartbeat = RecordingManagedMqttClient.Json(messages.Single(m => m.Topic.EndsWith("/Connection/Heartbeat", StringComparison.Ordinal)));
        Assert.AreEqual(1, heartbeat["value"]!.GetValue<long>());
        await worker.StopAsync(TestContext.CancellationToken).ConfigureAwait(false);
    }

    [TestMethod]
    public async Task APrinterThatAnswers_GivesEveryValueThenRunning_AndAPrinterThatFails_CommunicationFault()
    {
        using var mqtt = new RecordingManagedMqttClient();
        using var printer = new FakePrinter();
        using var worker = Worker(mqtt, printer);
        await worker.StartAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await UntilAsync(() => States(mqtt).Contains("Running")).ConfigureAwait(false);

        var messages = mqtt.Messages.ToList();
        var running = messages.FindIndex(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal) && Text(m) == "Running");
        var temperature = messages.FindIndex(m => m.Topic == Machine + "oem/Ultimaker/Bed/Temperature");
        Assert.IsTrue(temperature >= 0 && temperature < running, "the values come before Running");
        var status = RecordingManagedMqttClient.Json(messages.Single(m => m.Topic == Machine + "umati/State/Status"));
        Assert.AreEqual("Executing", status["value"]!["MachineryItemState"]!.GetValue<string>());
        Assert.IsFalse(messages.Any(m => m.Topic == Machine + "umati/State/Status/MachineryItemState"));
        var manifest = RecordingManagedMqttClient.Json(messages.Single(m => m.Topic == Machine + "umati/Manifest"));
        ModelSchemas.AssertValuesValid(messages, "ultimaker_UM3_UM3-01", manifest);

        // From printing into an error: the snapshot changes, so the stored field does not stay at Executing.
        printer.Status = "error";
        printer.NoJob = true;
        await UntilAsync(() => mqtt.Messages.Count(m => m.Topic == Machine + "umati/State/Status") == 2).ConfigureAwait(false);
        var fault = RecordingManagedMqttClient.Json(mqtt.Messages.Last(m => m.Topic == Machine + "umati/State/Status"));
        Assert.AreEqual("OutOfService", fault["value"]!["MachineryItemState"]!.GetValue<string>());

        printer.Fail = true;
        await UntilAsync(() => States(mqtt)[^1] == "CommunicationFault").ConfigureAwait(false);
        printer.Fail = false;
        await UntilAsync(() => States(mqtt)[^1] == "Running").ConfigureAwait(false);
        CollectionAssert.AreEqual(new[] { "Initializing", "Running", "CommunicationFault", "Running" }, States(mqtt).ToArray());

        await worker.StopAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual("Shutdown", States(mqtt)[^1]);
        Assert.AreEqual(Machine + "umati/Connection/State", mqtt.Messages.Last().Topic, "Shutdown is the last message");
    }

    [TestMethod]
    public void ConnectionFreshnessChangesOnFailureAndRecovery()
    {
        var state = new TelemetryState();
        Assert.IsFalse(state.IsFresh);
        state.Success();
        Assert.IsTrue(state.IsFresh);
        state.Failure();
        Assert.IsFalse(state.IsFresh);
        state.Success();
        Assert.IsTrue(state.IsFresh);
    }

    private static TelemetryWorker Worker(RecordingManagedMqttClient mqtt, HttpMessageHandler handler)
        => new(new FakeFactory(handler), mqtt, Options.Create(new TelemetryOptions { PollIntervalSecond = 1 }), new TelemetryState(),
            TimeProvider.System, NullLogger<TelemetryWorker>.Instance);

    private static List<string> States(RecordingManagedMqttClient mqtt)
        => [.. mqtt.Messages.Where(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)).Select(m => Text(m)!)];

    private static string? Text(MqttApplicationMessage message) => (string?)RecordingManagedMqttClient.Json(message)["value"];

    private async Task UntilAsync(Func<bool> condition)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        while (!condition())
        {
            await Task.Delay(50, timeout.Token).ConfigureAwait(false);
        }
    }

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("http://printer/api/v1/") };
    }

    private sealed class BlockedPrinter : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken).ConfigureAwait(false);
            return new(HttpStatusCode.ServiceUnavailable);
        }
    }

    /// <summary>The two routes of the printer the adapter reads; it answers, or fails while <see cref="Fail"/>.</summary>
    private sealed class FakePrinter : HttpMessageHandler
    {
        public volatile bool Fail;
        public volatile bool NoJob;
        public volatile string Status = "printing";

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.AreEqual(HttpMethod.Get, request.Method, "the adapter only reads");
            if (Fail)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            }
            var job = request.RequestUri!.AbsolutePath.EndsWith("/print_job", StringComparison.Ordinal);
            if (job && NoJob)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            }
            var body = job ? Job : Snapshot.Replace("\"status\":\"printing\"", "\"status\":\"" + Status + "\"", StringComparison.Ordinal);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
}
