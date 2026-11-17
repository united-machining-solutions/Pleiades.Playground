using System.Globalization;
using System.Security.Cryptography;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>A job of the printer history, as far as a notification needs it. No name and no user.</summary>
internal sealed record JobOutcome(string Uuid, string? Result, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt,
    DateTimeOffset? CleanedAt);

/// <summary>
/// Turns what the printer reports into notification events that come and go. It holds no clock: every
/// time is one the printer gave. The first observation is the baseline and raises nothing, so a restart
/// of the adapter does not report old faults again.
/// </summary>
internal sealed class FaultEventTracker(string serialNumber)
{
    private bool _baselined;
    private HashSet<PrinterFault> _knownFaults = [];
    private HashSet<string> _knownJobs = new(StringComparer.Ordinal);
    private readonly Dictionary<PrinterFault, string> _openFaults = [];
    private readonly Dictionary<string, (string NotificationId, string Title, EventLevel Level)> _openJobs = new(StringComparer.Ordinal);

    /// <param name="faults">The faults of the newest log lines.</param>
    /// <param name="jobs">The newest jobs of the history.</param>
    /// <param name="currentJobStartedAt">When the running job started, if one runs.</param>
    internal IReadOnlyList<NotificationEventDtoV1> Observe(IReadOnlyList<PrinterFault> faults,
        IReadOnlyList<JobOutcome> jobs, DateTimeOffset? currentJobStartedAt)
    {
        var events = new List<NotificationEventDtoV1>();
        if (_baselined)
        {
            foreach (var fault in faults.Where(fault => !_knownFaults.Contains(fault)))
            {
                var correlationId = string.Create(CultureInfo.InvariantCulture,
                    $"ultimaker-fault-{fault.Code}-{fault.RaisedAt.UtcDateTime:yyyyMMddTHHmmssfffZ}");
                _openFaults[fault] = correlationId;
                events.Add(Event(NotificationAction.Raised, fault.RaisedAt, EventLevel.Error,
                    FaultNotificationId(fault), fault.Message, correlationId));
            }
            foreach (var job in jobs.Where(job => !_knownJobs.Contains(job.Uuid)))
            {
                var kind = job.Result switch
                {
                    "Failed" => (Id: "ultimaker-print-failed", Title: "Print job failed", Level: EventLevel.Error),
                    "Aborted" => (Id: "ultimaker-print-aborted", Title: "Print job aborted", Level: EventLevel.Warning),
                    _ => default,
                };
                // Without a time of the printer there is no honest moment for the event.
                if (kind.Id is null || job.FinishedAt is not { } finishedAt) continue;
                _openJobs[job.Uuid] = kind;
                events.Add(Event(NotificationAction.Raised, finishedAt, kind.Level, kind.Id, kind.Title, JobCorrelationId(job.Uuid)));
            }
        }

        // A fault goes when a job starts after it: the printer reports no acknowledgement of its own.
        var starts = jobs.Select(job => job.StartedAt).Append(currentJobStartedAt).OfType<DateTimeOffset>().ToArray();
        foreach (var (fault, correlationId) in _openFaults.ToArray())
        {
            var later = starts.Where(start => start > fault.RaisedAt).ToArray();
            if (later.Length == 0) continue;
            _openFaults.Remove(fault);
            events.Add(Event(NotificationAction.Reset, later.Min(), EventLevel.Error,
                FaultNotificationId(fault), fault.Message, correlationId));
        }
        // A failed job goes when the printer reports the build plate as cleared.
        foreach (var job in jobs)
        {
            if (job.CleanedAt is not { } cleanedAt || !_openJobs.Remove(job.Uuid, out var kind)) continue;
            events.Add(Event(NotificationAction.Reset, cleanedAt, kind.Level, kind.NotificationId, kind.Title, JobCorrelationId(job.Uuid)));
        }

        // Remember what the printer still shows; what has scrolled out of its log cannot come back.
        _knownFaults = [.. faults];
        _knownJobs = new(jobs.Select(job => job.Uuid), StringComparer.Ordinal);
        _baselined = true;
        return events;
    }

    private static string FaultNotificationId(PrinterFault fault)
        => string.Create(CultureInfo.InvariantCulture, $"ultimaker-fault-{fault.Code}");

    private static string JobCorrelationId(string uuid) => "ultimaker-print-" + uuid;

    private NotificationEventDtoV1 Event(NotificationAction action, DateTimeOffset at, EventLevel level,
        string notificationId, string title, string correlationId) => new()
        {
            // The Events API stores the identifier as an ObjectId: 24 hexadecimal digits.
            Id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(12)),
            MId = serialNumber,
            Timestamp = at.UtcDateTime,
            Level = level,
            Action = action,
            NotificationId = notificationId,
            Title = title,
            LocalizedTitle = title,
            CorrelationId = correlationId,
        };
}
