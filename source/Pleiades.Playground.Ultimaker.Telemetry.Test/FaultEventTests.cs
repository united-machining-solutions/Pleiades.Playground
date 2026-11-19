// SPDX-License-Identifier: Apache-2.0
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions.Testing;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Telemetry.Test;

// The fake printer replays what an Ultimaker 3 with firmware 5.3.0 answered when its active levelling
// failed: the log lines with the host name replaced, the history without job and user names.
[TestClass]
public sealed class FaultEventTests
{
    public TestContext TestContext { get; set; } = null!;
    private const string FailedJob = """{"datetime_cleaned":"2026-11-17T20:18:48","datetime_finished":"2026-11-17T20:18:43","datetime_started":"2026-11-17T20:16:34","result":"Failed","uuid":"013e14bf-4829-4be6-a394-4a73221ecc7f"}""";
    private const string AbortedJob = """{"datetime_cleaned":"2026-11-17T20:16:33","datetime_finished":"2026-11-17T20:15:52","datetime_started":"2026-11-17T19:49:48","result":"Aborted","uuid":"19a2bb79-e661-43a2-bcc9-3c70e4339493"}""";
    private static readonly PrinterFault Fault = new(new DateTimeOffset(2026, 11, 17, 20, 18, 20, 59, TimeSpan.Zero), 48, 4, "Z-level out of range");

    private static string FaultLog() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "system-log-fault-48.json"));

    [TestMethod]
    public async Task FaultAndFailedJobOfThePrinterBecomeAlertEventsOfTheBinding()
    {
        var mqtt = new RecordingManagedMqttClient();
        var messages = mqtt.Messages;
        using var printer = new ReplayPrinter { Log = "[]", History = "[" + AbortedJob + "]" };
        using var worker = Worker(printer, mqtt);

        // What the printer shows when the adapter starts is the baseline, not news.
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(messages);

        printer.Log = FaultLog();
        printer.History = "[" + FailedJob + "," + AbortedJob + "]";
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsTrue(messages.All(m => m.Topic == "machines/ultimaker_UM3_UM3-01/events/notifications"
            && m.ContentType == "application/cloudevents+json; charset=utf-8"
            && m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce && !m.Retain));
        var events = messages.Select(m => JsonDocument.Parse(m.Payload).RootElement).ToArray();
        // The fault came and stays; the failed job came and went when the plate was reported as cleared.
        CollectionAssert.AreEqual(new[] { "Notification.AlertRaised", "Notification.AlertRaised", "Notification.AlertCleared" },
            events.Select(e => e.GetProperty("type").GetString()).ToArray());
        var fault = events[0];
        Assert.AreEqual("1.0", fault.GetProperty("specversion").GetString());
        Assert.AreEqual("https://ultimaker.com/UM3/UM3-01", fault.GetProperty("source").GetString());
        Assert.AreEqual("2026-11-17T20:18:20.059Z", fault.GetProperty("time").GetString());
        Assert.AreEqual("urn:umati2:datamodel:0.17.1:event.schema.json", fault.GetProperty("dataschema").GetString());
        Assert.IsTrue(Guid.TryParse(fault.GetProperty("id").GetString(), out _));
        var alert = fault.GetProperty("data");
        Assert.AreEqual("fault-48-20261117T201820059Z", alert.GetProperty("Id").GetString());
        Assert.AreEqual("48", alert.GetProperty("ErrorCode").GetString());
        Assert.AreEqual("The found Z-level 150.000 is not within the expected range [-30.000, 150.000]", alert.GetProperty("Message").GetString());
        Assert.AreEqual("Failure", alert.GetProperty("Severity").GetString());
        Assert.AreEqual("2026-11-17T20:18:20.059Z", alert.GetProperty("Time").GetString());
        Assert.IsFalse(alert.TryGetProperty("SeverityValue", out _));
        // The count has no gap, and coming and going of the job carry the same alert.
        var sequences = events.Select(e => e.GetProperty("sequence").GetString()!).ToArray();
        CollectionAssert.AreEqual(new[] { "000000000001", "000000000002", "000000000003" }, sequences.Select(s => s.Split('.')[1]).ToArray());
        Assert.HasCount(1, sequences.Select(s => s.Split('.')[0]).Distinct());
        Assert.AreEqual("print-013e14bf-4829-4be6-a394-4a73221ecc7f", events[1].GetProperty("data").GetProperty("Id").GetString());
        Assert.AreEqual(events[1].GetProperty("data").GetRawText(), events[2].GetProperty("data").GetRawText());
        Assert.AreEqual("2026-11-17T20:18:48.000Z", events[2].GetProperty("time").GetString());
        Assert.HasCount(3, events.Select(e => e.GetProperty("id").GetString()).Distinct());
        Assert.IsFalse(messages.Any(m => Encoding.UTF8.GetString(m.Payload).Contains("ultimakersystem", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void FaultIsClearedWithTheSameAlertWhenALaterJobStarts()
    {
        var tracker = new FaultEventTracker();
        Assert.IsEmpty(tracker.Observe([], [], null));
        var raised = tracker.Observe([Fault], [], null).Single();
        // A job that started before the fault is the one that failed, not a sign that the fault is gone.
        Assert.IsEmpty(tracker.Observe([Fault], [], Fault.RaisedAt.AddMinutes(-2)));
        var later = Fault.RaisedAt.AddMinutes(20);
        var cleared = tracker.Observe([Fault], [], later).Single();
        Assert.AreEqual(FaultEventTracker.AlertRaised, raised.Type);
        Assert.AreEqual(FaultEventTracker.AlertCleared, cleared.Type);
        Assert.AreEqual(raised.Data.ToJsonString(), cleared.Data.ToJsonString());
        Assert.AreEqual(later, cleared.Time);
        Assert.IsEmpty(tracker.Observe([Fault], [], later));
    }

    [TestMethod]
    public void AbortedJobIsAMessageThatDoesNotStayAndAJobWithoutATimeRaisesNothing()
    {
        var tracker = new FaultEventTracker();
        Assert.IsEmpty(tracker.Observe([], [], null));
        var finished = new DateTimeOffset(2026, 11, 17, 20, 15, 52, TimeSpan.Zero);
        var aborted = new JobOutcome("19a2bb79-e661-43a2-bcc9-3c70e4339493", "Aborted", finished.AddMinutes(-26), finished, null);
        var message = tracker.Observe([], [aborted], null).Single();
        Assert.AreEqual(FaultEventTracker.NotificationEvent, message.Type);
        Assert.AreEqual("PrintAborted", message.Data["ErrorCode"]!.GetValue<string>());
        Assert.IsFalse(message.Data.ContainsKey("Severity"));
        // Clearing the plate brings nothing more: a message has no end.
        Assert.IsEmpty(tracker.Observe([], [aborted with { CleanedAt = finished.AddSeconds(41) }], null));
        Assert.IsEmpty(tracker.Observe([], [new("a", "Finished", finished, finished, null), new("b", "Failed", finished, null, null)], null));
    }

    [TestMethod]
    public async Task EventsWaitInOrderWhileTheBrokerIsAwayAndAnUnreachablePrinterRaisesNothing()
    {
        var mqtt = new RecordingManagedMqttClient(connected: false);
        var messages = mqtt.Messages;
        using var printer = new ReplayPrinter { Log = "[]", History = "[]" };
        using var worker = Worker(printer, mqtt);
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        printer.Log = FaultLog();
        printer.History = "[" + FailedJob + "]";
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(messages);

        // The printer stops answering while the broker comes back: what waited goes out, nothing new comes up.
        printer.Status = HttpStatusCode.ServiceUnavailable;
        await mqtt.ConnectAsync().ConfigureAwait(false);
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.PollAsync(TestContext.CancellationToken)).ConfigureAwait(false);
        CollectionAssert.AreEqual(new[] { "000000000001", "000000000002", "000000000003" },
            messages.Select(m => JsonDocument.Parse(m.Payload).RootElement.GetProperty("sequence").GetString()!.Split('.')[1]).ToArray());
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.PollAsync(TestContext.CancellationToken)).ConfigureAwait(false);
        Assert.HasCount(3, messages);
    }

    private static FaultEventWorker Worker(ReplayPrinter printer, RecordingManagedMqttClient mqtt)
        => new(new FakeFactory(printer), mqtt, Options.Create(new TelemetryOptions()), NullLogger<FaultEventWorker>.Instance);

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("http://printer/api/v1/") };
    }

    private sealed class ReplayPrinter : HttpMessageHandler
    {
        internal string Log = "[]";
        internal string History = "[]";
        internal HttpStatusCode Status = HttpStatusCode.OK;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.AreEqual(HttpMethod.Get, request.Method);
            if (Status != HttpStatusCode.OK) return Task.FromResult(new HttpResponseMessage(Status));
            var path = request.RequestUri!.AbsolutePath;
            // No job runs, as on the printer while the message stood on its display.
            if (path == "/api/v1/print_job") return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            var body = path switch
            {
                "/api/v1/system/log" => Log,
                "/api/v1/history/print_jobs" => History,
                _ => throw new InvalidOperationException("Unexpected printer endpoint: " + path),
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
}
