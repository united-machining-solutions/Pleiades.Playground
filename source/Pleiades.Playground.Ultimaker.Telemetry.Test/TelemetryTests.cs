using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Ultimaker.Telemetry.Test;

[TestClass]
public sealed class TelemetryTests
{
    public TestContext TestContext { get; set; } = null!;
    private const string Snapshot = """
        {"status":"printing","bed":{"temperature":{"current":60.5,"target":60}},
         "heads":[{"position":{"x":120,"y":100,"z":1.2},"fan":50,"extruders":[
           {"hotend":{"temperature":{"current":200,"target":205}},"active_material":{"length_remaining":1000}},
           {"hotend":{"temperature":{"current":30,"target":0}},"active_material":{"length_remaining":-1}}]}]}
        """;

    [TestMethod]
    public void SnapshotsUseBindingUnitsAndOmitUnknownMaterialLengths()
    {
        using var printer = JsonDocument.Parse(Snapshot);
        using var job = JsonDocument.Parse("""{"state":"printing","uuid":"a-job","progress":0.25,"time_elapsed":10,"time_total":40}""");
        var now = DateTime.UtcNow;
        var values = TelemetryMapper.Map(printer.RootElement, job.RootElement, now);
        var temperature = (BaseUnitValueDto)values.Single(s => s.Suffix == "oem/Ultimaker/Bed/Temperature").Message;
        Assert.AreEqual(60.5, temperature.Value);
        Assert.AreEqual(BaseUnit.DegreeCelsius, temperature.Unit);
        Assert.AreEqual(now, temperature.Timestamp);
        Assert.AreEqual(.12, ((BaseUnitValueDto)values.Single(s => s.Suffix.EndsWith("Position/X", StringComparison.Ordinal)).Message).Value);
        Assert.AreEqual(.5, ((BaseUnitValueDto)values.Single(s => s.Suffix.EndsWith("FanFraction", StringComparison.Ordinal)).Message).Value);
        Assert.AreEqual(1, ((BaseUnitValueDto)values.Single(s => s.Suffix.EndsWith("0/MaterialRemainingLength", StringComparison.Ordinal)).Message).Value);
        Assert.IsFalse(values.Any(s => s.Suffix.EndsWith("1/MaterialRemainingLength", StringComparison.Ordinal)));
        Assert.AreEqual("Executing", ((StringValueDto)values.Single(s => s.Suffix == "umati/State/Status/MachineryItemState").Message).Value);
    }

    [TestMethod]
    public void NoJobOrUnknownValuesNeverBecomeInventedZeroProgressOrMachineStates()
    {
        using var printer = JsonDocument.Parse("""{"status":"future_status","bed":{"temperature":{"current":null}}}""");
        var values = TelemetryMapper.Map(printer.RootElement, null, DateTime.UtcNow);
        Assert.IsFalse(values.Any(s => s.Message is BaseUnitValueDto));
        Assert.IsFalse(values.Any(s => s.Suffix == "umati/State/Status/MachineryItemState"));
        Assert.AreEqual("none", ((StringValueDto)values.Single(s => s.Suffix == "oem/Ultimaker/Print/State").Message).Value);
        using var job = JsonDocument.Parse("""{"state":"paused","progress":-1,"time_elapsed":null,"time_total":-1}""");
        values = TelemetryMapper.Map(printer.RootElement, job.RootElement, DateTime.UtcNow);
        Assert.IsFalse(values.Any(s => s.Message is BaseUnitValueDto));
        Assert.AreEqual("NotExecuting", ((StringValueDto)values.Single(s => s.Suffix == "umati/State/Status/MachineryItemState").Message).Value);
    }

    [TestMethod]
    public async Task IndependentHeartbeatRunsWhilePrinterRequestIsBlocked()
    {
        var messages = new ConcurrentQueue<MqttApplicationMessage>();
        var firstHeartbeat = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var mqtt = new Mock<IManagedMqttClient>();
        mqtt.SetupGet(m => m.IsConnected).Returns(true);
        mqtt.Setup(m => m.EnqueueAsync(It.IsAny<MqttApplicationMessage>())).Returns((MqttApplicationMessage message) =>
        {
            messages.Enqueue(message);
            if (message.Topic.EndsWith("/Connection/Heartbeat", StringComparison.Ordinal)) firstHeartbeat.TrySetResult();
            return Task.CompletedTask;
        });
        using var handler = new BlockedPrinter();
        var factory = new FakeFactory(handler);
        using var worker = new TelemetryWorker(factory, mqtt.Object,
            Options.Create(new TelemetryOptions()), new TelemetryState(), NullLogger<TelemetryWorker>.Instance);
        await worker.StartAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await firstHeartbeat.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsFalse(messages.Any(m => m.Topic.Contains("/Temperature", StringComparison.Ordinal)));
        var heartbeat = messages.Single(m => m.Topic.EndsWith("/Connection/Heartbeat", StringComparison.Ordinal));
        Assert.AreEqual("baseunitvaluedto", heartbeat.ContentType);
        using var payload = JsonDocument.Parse(heartbeat.Payload);
        Assert.AreEqual(1, payload.RootElement.GetProperty("value").GetDouble());
        Assert.AreEqual("one", payload.RootElement.GetProperty("unit").GetString());
        var state = messages.Single(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal));
        Assert.AreEqual("stringvaluedto", state.ContentType);
        using var status = JsonDocument.Parse(state.Payload);
        Assert.AreEqual("CommunicationFault", status.RootElement.GetProperty("value").GetString());
        Assert.IsTrue(state.Topic.StartsWith("machines/ultimaker_UM3_UM3-01/", StringComparison.Ordinal), state.Topic);
        var model = messages.Single(m => m.Topic.EndsWith("/umati/Identification/Model", StringComparison.Ordinal));
        using var modelValue = JsonDocument.Parse(model.Payload);
        Assert.AreEqual("UM3", modelValue.RootElement.GetProperty("value").GetString());
        await worker.StopAsync(TestContext.CancellationToken).ConfigureAwait(false);
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
}
