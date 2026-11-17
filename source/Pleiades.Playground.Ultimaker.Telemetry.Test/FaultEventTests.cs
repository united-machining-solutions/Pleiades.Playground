using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Notification.DataTransferObjects;
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
    public async Task FaultAndFailedJobOfThePrinterBecomeNotificationEventsOfTheBinding()
    {
        var messages = new ConcurrentQueue<MqttApplicationMessage>();
        var mqtt = new Mock<IManagedMqttClient>();
        mqtt.SetupGet(m => m.IsConnected).Returns(true);
        mqtt.Setup(m => m.EnqueueAsync(It.IsAny<MqttApplicationMessage>())).Returns((MqttApplicationMessage message) =>
        {
            messages.Enqueue(message);
            return Task.CompletedTask;
        });
        using var printer = new ReplayPrinter { Log = "[]", History = "[" + AbortedJob + "]" };
        using var worker = new FaultEventWorker(new FakeFactory(printer), mqtt.Object,
            Options.Create(new TelemetryOptions()), NullLogger<FaultEventWorker>.Instance);

        // What the printer shows when the adapter starts is the baseline, not news.
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsEmpty(messages);

        printer.Log = FaultLog();
        printer.History = "[" + FailedJob + "," + AbortedJob + "]";
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsTrue(messages.All(m => m.Topic == "machines/UM3-01/events/notifications" && m.ContentType == "notificationeventdtov1"));
        var events = messages.Select(m => JsonDocument.Parse(m.Payload).RootElement).ToArray();
        // The fault came and stays; the failed job came and went when the plate was reported as cleared.
        Assert.HasCount(3, events);
        var fault = events.Single(e => e.GetProperty("notificationId").GetString() == "ultimaker-fault-48");
        Assert.AreEqual("Raised", fault.GetProperty("action").GetString());
        Assert.AreEqual("Error", fault.GetProperty("level").GetString());
        Assert.AreEqual("UM3-01", fault.GetProperty("mId").GetString());
        Assert.AreEqual("The found Z-level 150.000 is not within the expected range [-30.000, 150.000]", fault.GetProperty("title").GetString());
        Assert.AreEqual(new DateTime(2026, 11, 17, 20, 18, 20, 59, DateTimeKind.Utc), fault.GetProperty("timestamp").GetDateTime().ToUniversalTime());
        Assert.AreEqual(24, fault.GetProperty("id").GetString()!.Length);
        var job = events.Where(e => e.GetProperty("notificationId").GetString() == "ultimaker-print-failed").ToArray();
        CollectionAssert.AreEqual(new[] { "Raised", "Reset" }, job.Select(e => e.GetProperty("action").GetString()).ToArray());
        Assert.AreEqual(job[0].GetProperty("correlationId").GetString(), job[1].GetProperty("correlationId").GetString());
        Assert.IsFalse(messages.Any(m => Encoding.UTF8.GetString(m.Payload).Contains("ultimakersystem", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void FaultGoesWithTheSameCorrelationWhenALaterJobStarts()
    {
        var tracker = new FaultEventTracker("UM3-01");
        Assert.IsEmpty(tracker.Observe([], [], null));
        var raised = tracker.Observe([Fault], [], null).Single();
        // A job that started before the fault is the one that failed, not a sign that the fault is gone.
        Assert.IsEmpty(tracker.Observe([Fault], [], Fault.RaisedAt.AddMinutes(-2)));
        var later = Fault.RaisedAt.AddMinutes(20);
        var reset = tracker.Observe([Fault], [], later).Single();
        Assert.AreEqual(NotificationAction.Raised, raised.Action);
        Assert.AreEqual(NotificationAction.Reset, reset.Action);
        Assert.AreEqual(raised.CorrelationId, reset.CorrelationId);
        Assert.AreEqual(raised.NotificationId, reset.NotificationId);
        Assert.AreEqual(later.UtcDateTime, reset.Timestamp);
        Assert.AreNotEqual(raised.Id, reset.Id);
        Assert.IsEmpty(tracker.Observe([Fault], [], later));
    }

    [TestMethod]
    public void AbortedJobIsAWarningAndStaysUntilThePlateIsCleared()
    {
        var tracker = new FaultEventTracker("UM3-01");
        Assert.IsEmpty(tracker.Observe([], [], null));
        var finished = new DateTimeOffset(2026, 11, 17, 20, 15, 52, TimeSpan.Zero);
        var open = new JobOutcome("19a2bb79-e661-43a2-bcc9-3c70e4339493", "Aborted", finished.AddMinutes(-26), finished, null);
        var raised = tracker.Observe([], [open], null).Single();
        Assert.AreEqual(EventLevel.Warning, raised.Level);
        Assert.AreEqual("ultimaker-print-aborted", raised.NotificationId);
        Assert.IsEmpty(tracker.Observe([], [open], null));
        var reset = tracker.Observe([], [open with { CleanedAt = finished.AddSeconds(41) }], null).Single();
        Assert.AreEqual(NotificationAction.Reset, reset.Action);
        Assert.AreEqual(raised.CorrelationId, reset.CorrelationId);
        // A finished job and a job without a time of the printer raise nothing.
        Assert.IsEmpty(tracker.Observe([], [new("a", "Finished", finished, finished, null), new("b", "Failed", finished, null, null)], null));
    }

    [TestMethod]
    public async Task UnreachablePrinterOrBrokerRaisesAndResetsNothing()
    {
        var mqtt = new Mock<IManagedMqttClient>();
        mqtt.SetupGet(m => m.IsConnected).Returns(true);
        using var printer = new ReplayPrinter { Log = "[]", History = "[]", Status = HttpStatusCode.ServiceUnavailable };
        using var worker = new FaultEventWorker(new FakeFactory(printer), mqtt.Object,
            Options.Create(new TelemetryOptions()), NullLogger<FaultEventWorker>.Instance);
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.PollAsync(TestContext.CancellationToken)).ConfigureAwait(false);
        mqtt.SetupGet(m => m.IsConnected).Returns(false);
        await worker.PollAsync(TestContext.CancellationToken).ConfigureAwait(false);
        Assert.AreEqual(1, printer.Requests);
        mqtt.Verify(m => m.EnqueueAsync(It.IsAny<MqttApplicationMessage>()), Times.Never);
    }

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("http://printer/api/v1/") };
    }

    private sealed class ReplayPrinter : HttpMessageHandler
    {
        internal string Log = "[]";
        internal string History = "[]";
        internal HttpStatusCode Status = HttpStatusCode.OK;
        internal int Requests;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
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
