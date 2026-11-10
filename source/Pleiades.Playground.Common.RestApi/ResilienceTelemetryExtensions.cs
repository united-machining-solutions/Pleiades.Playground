using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Polly.Telemetry;

namespace Pleiades.Playground.Common.RestApi;

/// <summary>
/// Makes the resilience pipelines quiet about retries that worked, and loud about calls that
/// finally failed.
/// </summary>
/// <remarks>
/// <para>
/// By default every retry produces <b>two Warnings</b> — <c>ExecutionAttempt</c> and
/// <c>OnRetry</c> — and, when the cause was a timeout rather than an HTTP status, each carries a
/// full stack trace. Measured in a development environment: one slow upstream call produced twelve
/// stack-trace lines, and the call succeeded three seconds later.
/// </para>
/// <para>
/// <b>An alarm that shouts constantly gets learned away</b>, and then the real one goes unnoticed
/// too. The authorization package dropped its Degraded health status over the same thing, and the
/// DNS resolver's per-address warning was folded into a per-batch summary for it.
/// This is the same correction, one layer down.
/// </para>
/// <para>
/// <b>It is deliberately not a log-level filter on the Polly category.</b> That would silence the
/// retries and the final failure alike, which is the one distinction worth keeping: "retried once
/// and then fine" and "gave up" must not look the same. The severity is decided per event instead.
/// </para>
/// <para>
/// One call covers every pipeline in the process, because <c>TelemetryOptions</c> is global. That
/// is intended: the noise is a property of the mechanism, not of any one integration.
/// </para>
/// </remarks>
public static class ResilienceTelemetryExtensions
{
    /// <summary>Polly's event for a single attempt within a pipeline.</summary>
    private const string ExecutionAttempt = "ExecutionAttempt";

    /// <summary>Polly's event for a retry being scheduled.</summary>
    private const string OnRetry = "OnRetry";

    /// <summary>
    /// Polly's event for a single attempt running out of time - emitted at <b>Error</b>, per
    /// attempt, whether or not the next attempt succeeds.
    /// </summary>
    /// <remarks>
    /// Missing from the first version of this file, and that version's tests could not notice:
    /// they fed hand-built events, so they encoded which events I believed Polly emits rather
    /// than which it does. A real <c>AddStandardResilienceHandler()</c> pipeline run against a
    /// scripted handler showed that a timeout followed by a success still produced one Error
    /// <c>OnTimeout</c> - which is exactly the slow-upstream case this file was written for.
    /// <c>RealPipelineTelemetryTests</c> now runs that pipeline.
    /// </remarks>
    private const string OnTimeout = "OnTimeout";

    /// <summary>
    /// Moves per-attempt retry and timeout telemetry to Debug, and reports a finally-failed call
    /// at Error.
    /// </summary>
    public static IServiceCollection AddQuietRetryTelemetry(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddOptions<TelemetryOptions>().Configure<ILoggerFactory>((options, loggerFactory) =>
        {
            options.SeverityProvider = Severity;

            // The two halves are registered together on purpose. Lowering the retry events
            // without adding the listener would silence the failures along with the noise, which
            // is the worse of the two states this started from.
            options.TelemetryListeners.Add(
                new FinalFailureTelemetryListener(loggerFactory.CreateLogger<FinalFailureTelemetryListener>()));
        });

        return services;
    }

    /// <summary>
    /// The severity an event should be reported at.
    /// </summary>
    /// <remarks>
    /// Anything not named here keeps the severity Polly chose. Deciding only the two cases we
    /// have an opinion about leaves circuit-breaker and hedging events reporting as their authors
    /// intended.
    /// </remarks>
    private static ResilienceEventSeverity Severity(SeverityProviderArguments args) =>
        args.Event.EventName switch
        {
            // A retry that is about to happen says nothing about whether the call will succeed.
            //
            // Note what CANNOT be decided here: whether the pipeline ends up failing.
            // SeverityProviderArguments carries the event, the source and the context - not the
            // outcome - so "loud when it finally gave up" is not expressible at this hook. That
            // is what FinalFailureTelemetryListener is for, and why the two are registered
            // together.
            //
            // OnTimeout belongs here for the same reason: one attempt running out of time says
            // nothing about the call. If the pipeline finally fails on a timeout, the listener
            // reports it from the outcome - the information survives, only the per-attempt noise
            // does not.
            ExecutionAttempt or OnRetry or OnTimeout => ResilienceEventSeverity.Debug,

            _ => args.Event.Severity,
        };

}
