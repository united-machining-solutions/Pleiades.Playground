using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly.Telemetry;
using Pleiades.Playground.Common.RestApi;

namespace Pleiades.Playground.Common.RestApi.Test;

/// <summary>
/// Retry noise goes to Debug; a pipeline that finally gave up still says so at Warning.
/// </summary>
/// <remarks>
/// <b>The second test is why this is not a log-level filter.</b> Silencing the Polly category
/// would pass "no more retry spam" effortlessly and take the only message worth keeping with it -
/// so "a final failure is still reported" is asserted alongside, not afterwards.
/// </remarks>
[TestClass]
public sealed class ResilienceTelemetryTests
{
    [TestMethod]
    public void RetryEventsAreLoweredToDebug()
    {
        var severity = Options().SeverityProvider!;

        Assert.AreEqual(ResilienceEventSeverity.Debug, severity(Event("ExecutionAttempt")));
        Assert.AreEqual(ResilienceEventSeverity.Debug, severity(Event("OnRetry")));
        Assert.AreEqual(ResilienceEventSeverity.Debug, severity(Event("OnTimeout", ResilienceEventSeverity.Error)));
    }

    [TestMethod]
    public void EventsWeHaveNoOpinionAboutKeepTheirSeverity()
    {
        // Circuit-breaker and hedging events still report as their authors intended. A provider
        // that answered Debug for everything would pass the test above and quietly flatten the
        // rest of Polly's telemetry.
        var severity = Options().SeverityProvider!;

        Assert.AreEqual(ResilienceEventSeverity.Error, severity(Event("OnCircuitOpened", ResilienceEventSeverity.Error)));
    }

    [TestMethod]
    public void AFinalFailureIsStillReported()
    {
        var (listener, log) = Listener();

        listener.Write(Executed(new HttpResponseMessage(HttpStatusCode.GatewayTimeout)));

        Assert.HasCount(1, log.Warnings);
        StringAssertContains(log.Warnings[0], "504");
    }

    [TestMethod]
    public void AnExceptionIsStillReported()
    {
        var (listener, log) = Listener();

        listener.Write(Executed<object>(new TimeoutException("gave up"), CancellationToken.None));

        Assert.HasCount(1, log.Warnings);
        StringAssertContains(log.Warnings[0], nameof(TimeoutException));
    }

    [TestMethod]
    public void ARejectionByAnOpenCircuit_IsNotReported()
    {
        // OnCircuitOpened reports the state once; each rejected call is its consequence. Reporting
        // them would be a line per request for as long as the breaker stays open.
        var (listener, log) = Listener();

        listener.Write(Executed<object>(new Polly.CircuitBreaker.BrokenCircuitException(), CancellationToken.None));

        Assert.IsEmpty(log.Warnings);
    }

    [TestMethod]
    public void ACancellationByTheCaller_IsNotReported()
    {
        // The caller's own token is cancelled: the caller stopped waiting, nothing gave up.
        var (listener, log) = Listener();
        using var caller = new CancellationTokenSource();
        caller.Cancel();

        listener.Write(Executed<object>(new OperationCanceledException(caller.Token), caller.Token));

        Assert.IsEmpty(log.Warnings);
    }

    [TestMethod]
    public void ACancellationTheCallerDidNotAskFor_IsStillReported()
    {
        // Only the caller's own cancellation is excused. An OperationCanceledException that ends
        // the pipeline while the caller's token is still live came from somewhere else, and
        // silencing every cancellation would hide exactly that.
        var (listener, log) = Listener();

        listener.Write(Executed<object>(new OperationCanceledException(), CancellationToken.None));

        Assert.HasCount(1, log.Warnings);
        StringAssertContains(log.Warnings[0], nameof(OperationCanceledException));
    }

    [TestMethod]
    public void ACallThatSucceededSaysNothing()
    {
        // The whole point: a retry that worked produces no Warning at all.
        var (listener, log) = Listener();

        listener.Write(Executed(new HttpResponseMessage(HttpStatusCode.OK)));

        Assert.IsEmpty(log.Warnings);
    }

    [TestMethod]
    public void EventsOtherThanTheFinalOneAreIgnored()
    {
        var (listener, log) = Listener();

        listener.Write(new TelemetryEventArguments<object, object>(
            new ResilienceTelemetrySource("p", null, "retry"),
            new ResilienceEvent(ResilienceEventSeverity.Warning, "OnRetry"),
            Polly.ResilienceContextPool.Shared.Get(TestContext.CancellationToken),
            new object(),
            Polly.Outcome.FromException<object>(new TimeoutException())));

        Assert.IsEmpty(log.Warnings, "Only the pipeline's final outcome decides whether it failed.");
    }

    private static TelemetryOptions Options()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddQuietRetryTelemetry();

        return services.BuildServiceProvider().GetRequiredService<IOptions<TelemetryOptions>>().Value;
    }

    private static (TelemetryListener Listener, CapturingLogger Log) Listener()
    {
        var log = new CapturingLogger();
        var options = OptionsWith(log);

        return (options.TelemetryListeners.Single(), log);
    }

    private static TelemetryOptions OptionsWith(ILogger logger)
    {
        var services = new ServiceCollection();
        services.AddSingleton<ILoggerFactory>(new SingleLoggerFactory(logger));
        services.AddQuietRetryTelemetry();

        return services.BuildServiceProvider().GetRequiredService<IOptions<TelemetryOptions>>().Value;
    }

    private static SeverityProviderArguments Event(string name, ResilienceEventSeverity severity = ResilienceEventSeverity.Warning) =>
        new(new ResilienceTelemetrySource("pipeline", null, "strategy"),
            new ResilienceEvent(severity, name),
            Polly.ResilienceContextPool.Shared.Get());

    private static TelemetryEventArguments<T, object> Executed<T>(T result) =>
        new(new ResilienceTelemetrySource("IUpstreamService-standard", null, null),
            new ResilienceEvent(ResilienceEventSeverity.Information, "PipelineExecuted"),
            Polly.ResilienceContextPool.Shared.Get(),
            new object(),
            Polly.Outcome.FromResult(result));

    private static TelemetryEventArguments<T, object> Executed<T>(Exception exception, CancellationToken callerToken) =>
        new(new ResilienceTelemetrySource("IUpstreamService-standard", null, null),
            new ResilienceEvent(ResilienceEventSeverity.Information, "PipelineExecuted"),
            Polly.ResilienceContextPool.Shared.Get(callerToken),
            new object(),
            Polly.Outcome.FromException<T>(exception));

    private static void StringAssertContains(string actual, string expected) =>
        Assert.Contains(expected, actual, StringComparison.Ordinal);

    /// <summary>Injected by MSTest; used to flow the test cancellation token.</summary>
    public TestContext TestContext { get; set; } = null!;

    /// <summary>Collects messages at Warning and above - the listener reports at Error.</summary>
    private sealed class CapturingLogger : ILogger
    {
        internal List<string> Warnings { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel >= LogLevel.Warning)
            {
                Warnings.Add(formatter(state, exception));
            }
        }
    }

    private sealed class SingleLoggerFactory(ILogger logger) : ILoggerFactory
    {
        public void AddProvider(ILoggerProvider provider) { }

        public ILogger CreateLogger(string categoryName) => logger;

        public void Dispose() { }
    }
}
