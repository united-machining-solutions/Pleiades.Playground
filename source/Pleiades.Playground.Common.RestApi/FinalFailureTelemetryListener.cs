using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Telemetry;

namespace Pleiades.Playground.Common.RestApi;

/// <summary>
/// Reports a resilience pipeline that finally gave up, at Error, naming the pipeline.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is the other half of <see cref="ResilienceTelemetryExtensions"/>, and it exists because
/// the severity hook cannot do it.</b> <c>SeverityProviderArguments</c> carries only the event,
/// the source and the context — <b>not the outcome</b> — so "quiet when the retry worked, loud
/// when it did not" is not expressible there. A listener does see the outcome.
/// </para>
/// <para>
/// Without this, lowering the retry events to Debug would silence the failures along with the
/// noise, and <i>that</i> is the trade this change was written to avoid: a filter that makes
/// everything quiet passes "no more spam" and loses the only message worth keeping.
/// </para>
/// <para>
/// <b>Error, not Warning, and that is deliberate.</b> Polly already reports a finally-failed call
/// at Error today - as the last <c>ExecutionAttempt</c>, which the severity hook now lowers. The
/// first version of this listener reported at Warning, which quietly moved the final failure
/// down a level; anything alerting on Error would have stopped seeing upstream outages. This
/// keeps the level and only changes the message: one line, naming the pipeline, instead of a
/// stack trace per attempt.
/// </para>
/// <para>
/// Where Polly decides it: <c>TelemetryUtil.ReportFinalExecutionAttempt</c> in Polly.Core, which
/// reports a handled final attempt at Error, while <c>ReportExecutionAttempt</c> reports the
/// attempts before it at Warning. The method names are verified against Polly.Core 8.4.2; the
/// severities were measured with a real pipeline on 2026-10-07 - a 503 that never recovers gave
/// exactly one Error - and <c>RealPipelineTelemetryTests</c> holds them. Re-check both if the
/// package moves past 8.4.x.
/// </para>
/// <para>
/// It also matches what the levels mean. Microsoft's guidance defines Error as a failure of the
/// current operation or request, and Warning as an abnormal event that does not make the app
/// fail. A call that gives up after every retry is a failure of the operation.
/// </para>
/// </remarks>
internal sealed class FinalFailureTelemetryListener(ILogger logger) : TelemetryListener
{
    /// <summary>Polly's event for the pipeline finishing, carrying the final outcome.</summary>
    private const string PipelineExecuted = "PipelineExecuted";

    private static readonly Action<ILogger, string, string, Exception?> LogGaveUp =
        LoggerMessage.Define<string, string>(LogLevel.Error, new EventId(400, nameof(LogGaveUp)),
            "Resilience pipeline {PipelineName} gave up: {Outcome}");

    /// <inheritdoc />
    public override void Write<TResult, TArgs>(in TelemetryEventArguments<TResult, TArgs> args)
    {
        if (!string.Equals(args.Event.EventName, PipelineExecuted, StringComparison.Ordinal))
        {
            return;
        }

        var outcome = args.Outcome;
        if (outcome is null)
        {
            return;
        }

        // An open circuit rejects every call without trying it, and each rejection ends the
        // pipeline with this exception. Reporting them would be one line per request for as long
        // as the breaker stays open - measured at six lines for six calls - which under load is a
        // new noise source of exactly the kind this class exists to remove. The state itself is
        // already reported once, at Error, as OnCircuitOpened; the rejections are its
        // consequence, not news.
        if (outcome.Value.Exception is BrokenCircuitException)
        {
            return;
        }

        // A caller that cancels its own request stopped waiting; the pipeline did not give up, and
        // the caller already holds the cancellation. Only the caller's own token excuses it: an
        // OperationCanceledException while that token is still live came from somewhere else and
        // is reported. A timeout of the pipeline arrives as TimeoutRejectedException and is
        // reported too.
        // HttpClient.Timeout cancels this same token, so a client timeout below the standard
        // handler's total timeout (30 s) counts as the caller's and is not reported - measured in
        // review: 100 ms logs nothing, 5 s logs one TimeoutRejectedException line. That holds only
        // for a timeout set after AddStandardResilienceHandler() or on the instance: the handler
        // sets HttpClient.Timeout to infinite and overwrites one configured before it.
        if (outcome.Value.Exception is OperationCanceledException
            && args.Context.CancellationToken.IsCancellationRequested)
        {
            return;
        }

        if (outcome.Value.Exception is { } exception)
        {
            LogGaveUp(logger, PipelineNameOf(args.Source), exception.GetType().Name, exception);
            return;
        }

        // The quieter failure, and the one that is easy to miss: a 504 that outlived its
        // retries arrives as a perfectly ordinary result. Treating it as success is how an
        // upstream outage reads as silence.
        //
        // But only a status the standard handler retries means something was given up - 5xx, 408
        // and 429, decided by the same predicate its retry uses. A 404 or 401 is not retried; it is
        // the caller's answer to read, and reporting it at Error put ordinary client traffic on
        // every Error alert.
        if (outcome.Value.Result is HttpResponseMessage { IsSuccessStatusCode: false } response
            && HttpClientResiliencePredicates.IsTransient(Outcome.FromResult(response)))
        {
            LogGaveUp(logger, PipelineNameOf(args.Source), $"HTTP {(int)response.StatusCode}", null);
        }
    }

    /// <summary>
    /// The pipeline name, or a placeholder. It is nullable, and a warning that cannot say WHICH
    /// upstream gave up is worth little - so the gap is named rather than left blank.
    /// </summary>
    private static string PipelineNameOf(ResilienceTelemetrySource source) =>
        source.PipelineName ?? "(unnamed pipeline)";
}
