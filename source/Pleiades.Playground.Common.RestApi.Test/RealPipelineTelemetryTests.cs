using System.Collections.Concurrent;
using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Polly;
using Pleiades.Playground.Common.RestApi;

namespace Pleiades.Playground.Common.RestApi.Test;

/// <summary>
/// The quiet-retry telemetry, measured against a REAL <c>AddStandardResilienceHandler()</c>
/// pipeline rather than hand-built events.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this file exists.</b> <see cref="ResilienceTelemetryTests"/> feeds the severity hook and
/// the listener events constructed by hand, so it encodes which events I believed Polly emits - and
/// can only ever confirm that belief. It missed <c>OnTimeout</c>, which Polly raises at Error for
/// every attempt that runs out of time. Running the real pipeline against a scripted handler
/// found it; this is that experiment, kept.
/// </para>
/// <para>
/// Setup: retry delay 10 ms, constant, no jitter; attempt timeout 200 ms; everything
/// else at the standard handler's defaults. Each test builds its own provider, so circuit-breaker
/// state cannot leak between scenarios.
/// </para>
/// </remarks>
[TestClass]
public sealed class RealPipelineTelemetryTests
{
    [TestMethod]
    public async Task ATimeoutFollowedBySuccess_ReportsNothing()
    {
        // The slow-upstream case this whole change was written for, and the one the first version got
        // wrong: one Error OnTimeout survived.
        var (client, log) = Build(Step.Hang, Step.Ok);

        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsEmpty(log.Reported, Describe(log));
    }

    [TestMethod]
    public async Task A503FollowedBySuccess_ReportsNothing()
    {
        var (client, log) = Build(Step.Status(HttpStatusCode.ServiceUnavailable), Step.Ok);

        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsEmpty(log.Reported, Describe(log));
    }

    [TestMethod]
    public async Task A503ThatNeverRecovers_IsReportedOnce_AtError()
    {
        // The other half, and the one a plain log filter would lose. Polly reported this at Error
        // before the change, as the last ExecutionAttempt; it must still be Error afterwards, or
        // anything alerting on Error goes blind.
        var (client, log) = Build(Step.Status(HttpStatusCode.ServiceUnavailable));

        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.HasCount(1, log.Reported, Describe(log));
        Assert.AreEqual(LogLevel.Error, log.Reported[0].Level);
        Assert.Contains("gave up", log.Reported[0].Message, StringComparison.Ordinal);
        Assert.Contains("503", log.Reported[0].Message, StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow(HttpStatusCode.NotFound)]
    [DataRow(HttpStatusCode.Unauthorized)]
    public async Task A4xxThatIsNotRetried_ReportsNothing(HttpStatusCode status)
    {
        // The standard handler does not retry a 404 or 401, so nothing was given up: the answer is
        // the caller's to read, and before this listener existed it was not logged at all. Reported
        // at Error, it put ordinary client traffic on every Error alert.
        var (client, log) = Build(Step.Status(status));

        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.AreEqual(status, response.StatusCode);
        Assert.IsEmpty(log.Reported, Describe(log));
    }

    [TestMethod]
    public async Task ACallTheCallerCancels_ReportsNothing()
    {
        // The caller gave up, not the pipeline: nothing was retried to exhaustion, and the caller
        // already holds the cancellation. Reported at Error, it counted as a final failure in the
        // alert rule that counts them.
        var (client, log) = Build(Step.Hang);
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        caller.CancelAfter(TimeSpan.FromMilliseconds(50));

        await Assert.ThrowsAsync<OperationCanceledException>(() => client.GetAsync("/", caller.Token));

        Assert.IsEmpty(log.Reported, Describe(log));
    }

    [TestMethod]
    public async Task AFinalFailure_NamesThePipeline()
    {
        // The other side of the cancellation case: a call the retries could not save still
        // reports one Error line, and it says which upstream it was.
        var (client, log) = Build(Step.Status(HttpStatusCode.ServiceUnavailable));

        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.HasCount(1, log.Reported, Describe(log));
        Assert.AreEqual(LogLevel.Error, log.Reported[0].Level);
        Assert.Contains("Resilience pipeline probe-standard gave up", log.Reported[0].Message, StringComparison.Ordinal);

        // The line an alert rule counts as a final failure, identified by its event.
        Assert.AreEqual(400, log.Reported[0].EventId.Id);
        Assert.AreEqual("LogGaveUp", log.Reported[0].EventId.Name);
    }

    [TestMethod]
    public async Task ATimeoutThatNeverRecovers_IsReportedOnce_AtError()
    {
        // Four attempts, four OnTimeout events lowered to Debug - and still exactly one line,
        // because the final outcome carries the information the per-attempt events did.
        var (client, log) = Build(Step.Hang);

        await Assert.ThrowsAsync<Exception>(() => client.GetAsync("/", TestContext.CancellationToken));

        Assert.HasCount(1, log.Reported, Describe(log));
        Assert.AreEqual(LogLevel.Error, log.Reported[0].Level);
        Assert.Contains("gave up", log.Reported[0].Message, StringComparison.Ordinal);
        Assert.Contains("TimeoutRejectedException", log.Reported[0].Message, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task AnOpenCircuit_IsReportedOnce_NotOncePerRejectedCall()
    {
        // MinimumThroughput 2 so the breaker opens inside the first call. Measured before this
        // fix: one Error OnCircuitOpened plus one Warning per call for every request the open
        // breaker rejected.
        var (client, log) = Build(
            configure: o => o.CircuitBreaker.MinimumThroughput = 2,
            Step.Status(HttpStatusCode.InternalServerError));

        for (var call = 0; call < 6; call++)
        {
            try
            {
                using var _ = await client.GetAsync("/", TestContext.CancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Rejections by the open breaker surface here; what matters is what got logged.
            }
        }

        // Proves the breaker actually opened. Without this the next assertion passes vacuously.
        Assert.HasCount(1, log.Reported.Where(e => e.Message.Contains("OnCircuitOpened", StringComparison.Ordinal)).ToList(), Describe(log));

        Assert.IsEmpty(
            log.Reported.Where(e => e.Message.Contains("BrokenCircuitException", StringComparison.Ordinal)).ToList(),
            "Each rejection by an open breaker is a consequence of OnCircuitOpened, not news. " + Describe(log));
    }

    private static (HttpClient Client, CapturingProvider Log) Build(params Step[] script) =>
        Build(configure: null, script);

    private static (HttpClient Client, CapturingProvider Log) Build(
        Action<Microsoft.Extensions.Http.Resilience.HttpStandardResilienceOptions>? configure,
        params Step[] script)
    {
        var log = new CapturingProvider();
        var handler = new ScriptedHandler(script);

        var services = new ServiceCollection();
        services.AddLogging(b => b.SetMinimumLevel(LogLevel.Trace).AddProvider(log));
        services.AddQuietRetryTelemetry();
        services.AddHttpClient("probe", c => c.BaseAddress = new Uri("http://upstream.test.invalid"))
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .SetHandlerLifetime(Timeout.InfiniteTimeSpan)
            .AddStandardResilienceHandler(o =>
            {
                o.Retry.Delay = TimeSpan.FromMilliseconds(10);
                o.Retry.BackoffType = Polly.DelayBackoffType.Constant;
                o.Retry.UseJitter = false;
                o.AttemptTimeout.Timeout = TimeSpan.FromMilliseconds(200);
                configure?.Invoke(o);
            });

        var client = services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>().CreateClient("probe");
        return (client, log);
    }

    private static string Describe(CapturingProvider log) =>
        "Reported:" + Environment.NewLine + string.Join(Environment.NewLine, log.Reported.Select(e => $"  {e.Level}: {e.Message}"));

    /// <summary>Injected by MSTest; used to flow the test cancellation token.</summary>
    public TestContext TestContext { get; set; } = null!;

    /// <summary>One step of the upstream's behaviour. The last step repeats once the script runs out.</summary>
    private sealed record Step(HttpStatusCode? Code)
    {
        internal static Step Ok { get; } = new(HttpStatusCode.OK);

        /// <summary>Never answers; the attempt timeout ends it.</summary>
        internal static Step Hang { get; } = new((HttpStatusCode?)null);

        internal static Step Status(HttpStatusCode code) => new(code);
    }

    private sealed class ScriptedHandler(Step[] script) : HttpMessageHandler
    {
        private int _calls;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var index = Math.Min(Interlocked.Increment(ref _calls) - 1, script.Length - 1);
            var step = script[index];

            if (step.Code is null)
            {
                await Task.Delay(Timeout.Infinite, cancellationToken).ConfigureAwait(false);
            }

            return new HttpResponseMessage(step.Code!.Value);
        }
    }

    /// <summary>Records everything at Warning or above, from every category.</summary>
    private sealed class CapturingProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<(LogLevel Level, EventId EventId, string Message)> _entries = new();

        internal List<(LogLevel Level, EventId EventId, string Message)> Reported => [.. _entries];

        public ILogger CreateLogger(string categoryName) => new Capturing(_entries);

        public void Dispose() { }

        private sealed class Capturing(ConcurrentQueue<(LogLevel Level, EventId EventId, string Message)> entries) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (logLevel >= LogLevel.Warning)
                {
                    entries.Enqueue((logLevel, eventId, formatter(state, exception) + (exception is null ? "" : " | " + exception.GetType().Name)));
                }
            }
        }
    }
}
