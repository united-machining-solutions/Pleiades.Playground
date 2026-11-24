// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json.Nodes;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>A job of the printer history, as far as an event needs it. No name and no user.</summary>
internal sealed record JobOutcome(string Uuid, string? Result, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt,
    DateTimeOffset? CleanedAt);

/// <summary>An event of the group <c>Notification</c> of the data model, before it gets its envelope.</summary>
/// <param name="Type">The path of the event, such as <c>Notification.AlertRaised</c>.</param>
/// <param name="Time">The source time of the event: a time the printer gave.</param>
/// <param name="Data">The flat struct of the event: the alert, or the message.</param>
internal sealed record PrinterEvent(string Type, DateTimeOffset Time, JsonObject Data);

/// <summary>
/// Turns what the printer reports into alerts that come and go. It holds no clock: every time is one the
/// printer gave. The first observation is the baseline and raises nothing, so a restart of the adapter
/// does not report old faults again.
/// </summary>
internal sealed class FaultEventTracker
{
    internal const string AlertRaised = "Notification.AlertRaised";
    internal const string AlertCleared = "Notification.AlertCleared";
    internal const string NotificationEvent = "Notification.NotificationEvent";
    private const string SourceName = "Printer";

    private bool _baselined;
    private HashSet<PrinterFault> _knownFaults = [];
    private HashSet<string> _knownJobs = new(StringComparer.Ordinal);
    private readonly Dictionary<PrinterFault, JsonObject> _openFaults = [];
    private readonly Dictionary<string, JsonObject> _openJobs = new(StringComparer.Ordinal);

    /// <param name="faults">The faults of the newest log lines.</param>
    /// <param name="jobs">The newest jobs of the history.</param>
    /// <param name="currentJobStartedAt">When the running job started, if one runs.</param>
    internal IReadOnlyList<PrinterEvent> Observe(IReadOnlyList<PrinterFault> faults,
        IReadOnlyList<JobOutcome> jobs, DateTimeOffset? currentJobStartedAt)
    {
        var events = new List<PrinterEvent>();
        if (_baselined)
        {
            foreach (var fault in faults.Where(fault => !_knownFaults.Contains(fault)))
            {
                // A fault that reaches the display stops the job: the category Failure of NAMUR NE 107. The
                // level of the manufacturer has no known scale, so no SeverityValue is made of it.
                var alert = Alert(string.Create(CultureInfo.InvariantCulture,
                        $"fault-{fault.Code}-{fault.RaisedAt.UtcDateTime:yyyyMMddTHHmmssfffZ}"),
                    fault.Code.ToString(CultureInfo.InvariantCulture), fault.Message, "Failure", fault.RaisedAt);
                _openFaults[fault] = alert;
                events.Add(new(AlertRaised, fault.RaisedAt, alert));
            }
            foreach (var job in jobs.Where(job => !_knownJobs.Contains(job.Uuid)))
            {
                // Without a time of the printer there is no honest moment for the event.
                if (job.FinishedAt is not { } finishedAt) continue;
                if (job.Result == "Failed")
                {
                    var alert = Alert("print-" + job.Uuid, "PrintFailed", "Print job failed", "Failure", finishedAt);
                    _openJobs[job.Uuid] = alert;
                    events.Add(new(AlertRaised, finishedAt, alert));
                }
                else if (job.Result == "Aborted")
                {
                    // Somebody stopped the job: a message that does not stay, an alert without a severity.
                    events.Add(new(NotificationEvent, finishedAt,
                        Alert("print-" + job.Uuid, "PrintAborted", "Print job aborted", null, finishedAt)));
                }
            }
        }

        // A fault goes when a job starts after it: the printer reports no acknowledgement of its own.
        var starts = jobs.Select(job => job.StartedAt).Append(currentJobStartedAt).OfType<DateTimeOffset>().ToArray();
        foreach (var (fault, alert) in _openFaults.ToArray())
        {
            var later = starts.Where(start => start > fault.RaisedAt).ToArray();
            if (later.Length == 0) continue;
            _openFaults.Remove(fault);
            events.Add(new(AlertCleared, later.Min(), alert));
        }
        // A failed job goes when the printer reports the build plate as cleared.
        foreach (var job in jobs)
        {
            if (job.CleanedAt is not { } cleanedAt || !_openJobs.Remove(job.Uuid, out var alert)) continue;
            events.Add(new(AlertCleared, cleanedAt, alert));
        }

        // Remember what the printer still shows; what has scrolled out of its log cannot come back.
        _knownFaults = [.. faults];
        _knownJobs = new(jobs.Select(job => job.Uuid), StringComparer.Ordinal);
        _baselined = true;
        return events;
    }

    /// <summary>The fields of an alert as the MQTT binding lists them; <c>Time</c> is since when it stands.</summary>
    private static JsonObject Alert(string id, string errorCode, string message, string? severity, DateTimeOffset since)
    {
        var alert = new JsonObject { ["Id"] = id, ["ErrorCode"] = errorCode, ["Message"] = message };
        if (severity is not null) alert["Severity"] = severity;
        alert["Time"] = FaultEventEnvelope.Timestamp(since);
        alert["SourceName"] = SourceName;
        return alert;
    }
}
