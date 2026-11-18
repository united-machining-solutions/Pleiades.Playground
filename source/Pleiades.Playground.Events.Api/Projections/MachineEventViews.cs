// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Projections;

/// <summary>
/// The views on the CloudEvents of machines, put together when they are read: alerts from their raise to their
/// clear, the last state of each job order, the program executions from start to end, and the gaps in the numbers.
/// Every event of the data model carries the whole entry after it, so the last event of an alert, a job order or a
/// program execution is its state.
/// </summary>
internal static class MachineEventViews
{
    public const string AlertRaised = "Notification.AlertRaised";
    public const string AlertChanged = "Notification.AlertChanged";
    public const string AlertCleared = "Notification.AlertCleared";
    public const string JobOrderPrefix = "JobMonitoring.JobOrder";
    public const string JobOrderStarted = "JobMonitoring.JobOrderStarted";
    public const string JobOrderResultChanged = "JobMonitoring.JobOrderResultChanged";
    public const string JobOrderRemoved = "JobMonitoring.JobOrderRemoved";
    public const string ProgramExecutionPrefix = "WorkMasterMonitoring.ProgramExecution";

    /// <summary>The severities of NAMUR NE 107, in the order of their weight.</summary>
    public static readonly IReadOnlyList<string> Severities = ["Failure", "CheckFunction", "OffSpec", "MaintenanceRequired"];

    // ─── alerts ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Every alert that stood at some time in [<paramref name="from"/>, <paramref name="to"/>]: raised before
    /// <paramref name="to"/> and not cleared before <paramref name="from"/>. The alert is paired by its
    /// <c>Id</c>; its fields are those of its last event.
    /// </summary>
    /// <param name="events">Events of the group Notification in any order, since before the range.</param>
    /// <param name="from">Start of the range; null for no start.</param>
    /// <param name="to">End of the range; null for no end.</param>
    public static List<AlertPairDtoV1> AlertPairs(IEnumerable<MachineEventDtoV1> events, DateTime? from = null, DateTime? to = null)
    {
        ArgumentNullException.ThrowIfNull(events);
        return [.. events
            .Where(e => e.Type is AlertRaised or AlertChanged or AlertCleared && Text(e.Data, "Id") is not null)
            .GroupBy(e => (e.MId, AlertId: Text(e.Data, "Id")!))
            .Select(group =>
            {
                var ordered = group.OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal).ToList();
                var last = ordered[^1];
                var raised = ordered.FirstOrDefault(e => e.Type == AlertRaised);
                var cleared = ordered.LastOrDefault(e => e.Type == AlertCleared);
                var raisedAt = Time(last.Data, "Time") ?? raised?.Time ?? ordered[0].Time;
                DateTime? clearedAt = cleared?.Time;
                return new AlertPairDtoV1
                {
                    MId = group.Key.MId,
                    AlertId = group.Key.AlertId,
                    ErrorCode = Text(last.Data, "ErrorCode"),
                    Message = Text(last.Data, "Message"),
                    Severity = Text(last.Data, "Severity"),
                    SeverityValue = Integer(last.Data, "SeverityValue") is { } value ? (int)value : null,
                    SourceName = Text(last.Data, "SourceName"),
                    CorrelationId = Text(last.Data, "correlationId") ?? last.CorrelationId,
                    RaisedAt = raisedAt,
                    LastChange = last.Time,
                    ClearedAt = clearedAt,
                    DurationSeconds = clearedAt is { } end ? Math.Round((end - raisedAt).TotalSeconds, 3) : null,
                };
            })
            .Where(p => (to is null || p.RaisedAt <= to) && (from is null || p.ClearedAt is null || p.ClearedAt >= from))
            .OrderBy(p => p.RaisedAt)];
    }

    /// <summary>The alerts that stand now: raised and not cleared.</summary>
    public static List<AlertDtoV1> ActiveAlerts(IEnumerable<MachineEventDtoV1> events)
    {
        return [.. AlertPairs(events).Where(p => p.ClearedAt is null).Select(p => (AlertDtoV1)p with { })];
    }

    /// <summary>The alerts that stood in the range, by severity, in the order of NE 107.</summary>
    public static List<AlertStatisticDtoV1> AlertStatistics(IEnumerable<AlertPairDtoV1> pairs)
    {
        ArgumentNullException.ThrowIfNull(pairs);
        var all = pairs.ToList();
        return [.. all
            .GroupBy(p => p.Severity ?? "Unknown")
            .OrderBy(g => Severities.ToList().IndexOf(g.Key) is var i && i < 0 ? int.MaxValue : i)
            .Select(g => new AlertStatisticDtoV1
            {
                Severity = g.Key,
                Raised = g.Count(),
                Active = g.Count(p => p.ClearedAt is null),
                TotalDurationSeconds = Math.Round(g.Sum(p => p.DurationSeconds ?? 0), 3),
            })];
    }

    // ─── program executions ────────────────────────────────────────────────────

    /// <summary>
    /// Pairs the events of each program execution by its <c>ExecutionId</c>: the start, the end (Ended or Aborted)
    /// with its sums, how often it was interrupted, and its state after its last event.
    /// </summary>
    /// <param name="events">Events of the group WorkMasterMonitoring in any order.</param>
    public static List<ProgramExecutionDtoV1> ProgramExecutions(IEnumerable<MachineEventDtoV1> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        return [.. events
            .Where(e => e.Type.StartsWith(ProgramExecutionPrefix, StringComparison.Ordinal) && Text(e.Data, "ExecutionId") is not null)
            .GroupBy(e => (e.MId, ExecutionId: Text(e.Data, "ExecutionId")!))
            .Select(group =>
            {
                var ordered = group.OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal).ToList();
                var last = ordered[^1];
                var end = ordered.LastOrDefault(e => e.Type is ProgramExecutionPrefix + "Ended" or ProgramExecutionPrefix + "Aborted");
                return new ProgramExecutionDtoV1
                {
                    MId = group.Key.MId,
                    ExecutionId = group.Key.ExecutionId,
                    JobOrderId = ordered.Select(e => Text(e.Data, "JobOrderID")).LastOrDefault(id => id is not null),
                    WorkMasterId = ordered.Select(e => Text(e.Data, "ActiveWorkMaster")).LastOrDefault(w => w is not null),
                    State = Text(last.Data, "State") ?? string.Empty,
                    StartTime = Time(last.Data, "StartTime") ?? ordered[0].Time,
                    EndTime = end?.Time,
                    EndType = end?.Type[ProgramExecutionPrefix.Length..],
                    Interruptions = ordered.Count(e => e.Type == ProgramExecutionPrefix + "Interrupted"),
                    Duration = end is null ? null : Number(end.Data, "Duration"),
                    PartsProduced = end is null ? null : Number(end.Data, "PartsProduced"),
                    EnergyElectricity = end is null ? null : Number(end.Data, "EnergyElectricity"),
                    EnergyCompressedAir = end is null ? null : Number(end.Data, "EnergyCompressedAir"),
                };
            })];
    }

    // ─── job orders ────────────────────────────────────────────────────────────

    /// <summary>
    /// The last known state of each job order: the entry of its last job order event, the result of its last
    /// <c>JobOrderResultChanged</c> (a result comes with <c>JobOrderStarted</c>, from its start with nothing produced
    /// yet), and the number and energy of its program executions.
    /// </summary>
    /// <param name="jobEvents">Events of the group JobMonitoring in any order.</param>
    /// <param name="workMasterEvents">Events of the group WorkMasterMonitoring; those of a job order count for it.</param>
    public static List<JobOrderDtoV1> JobOrders(IEnumerable<MachineEventDtoV1> jobEvents, IEnumerable<MachineEventDtoV1> workMasterEvents)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var executions = ProgramExecutions(workMasterEvents)
            .Where(p => p.JobOrderId is not null)
            .ToLookup(p => (p.MId, JobOrderId: p.JobOrderId!));

        return [.. jobEvents
            .Where(e => e.Type.StartsWith(JobOrderPrefix, StringComparison.Ordinal) && Text(e.Data, "JobOrderID") is not null)
            .GroupBy(e => (e.MId, JobOrderId: Text(e.Data, "JobOrderID")!))
            .Select(group =>
            {
                var ordered = group.OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal).ToList();
                var last = ordered[^1];
                var order = ordered.LastOrDefault(e => e.Type != JobOrderResultChanged)?.Data;
                var result = ordered.LastOrDefault(e => e.Type == JobOrderResultChanged)?.Data;
                var started = ordered.LastOrDefault(e => e.Type == JobOrderStarted);
                var ofJob = executions[group.Key].ToList();
                var outcome = ResultOf(result, started);
                return new JobOrderDtoV1
                {
                    MId = group.Key.MId,
                    JobOrderId = group.Key.JobOrderId,
                    State = order is { } o ? Text(o, "State") ?? string.Empty : string.Empty,
                    LastType = last.Type,
                    LastChange = last.Time,
                    FirstSeen = ordered[0].Time,
                    Removed = last.Type == JobOrderRemoved,
                    JobName = order is { } n ? Text(n, "JobName") : null,
                    WorkMasterId = order is { } w ? Text(w, "WorkMasterID") : null,
                    OrderNumbers = order is { } d && d.TryGetProperty("OrderNumbers", out var numbers) && numbers.ValueKind == JsonValueKind.Array
                        ? [.. numbers.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!)]
                        : null,
                    RunsPlanned = order is { } r ? Integer(r, "RunsPlanned") : null,
                    JobExecutionMode = order is { } m ? Text(m, "JobExecutionMode") : null,
                    PlannedStartTime = order is { } ps ? Time(ps, "PlannedStartTime") : null,
                    PlannedEndTime = order is { } pe ? Time(pe, "PlannedEndTime") : null,
                    StartTime = outcome.StartTime,
                    EndTime = outcome.EndTime,
                    ProducedQuantity = outcome.ProducedQuantity,
                    GoodQuantity = outcome.GoodQuantity,
                    RunsCompleted = outcome.RunsCompleted,
                    ActualProductionTime = outcome.ActualProductionTime,
                    JobResult = outcome.JobResult,
                    ProgramExecutions = ofJob.Count,
                    EnergyElectricity = Math.Round(ofJob.Sum(p => p.EnergyElectricity ?? 0), 3),
                    EnergyCompressedAir = Math.Round(ofJob.Sum(p => p.EnergyCompressedAir ?? 0), 3),
                };
            })];
    }

    /// <summary>The result of a job order: its last JobOrderResultChanged, or from its start nothing produced yet, or none.</summary>
    private static JobOutcome ResultOf(JsonElement? result, MachineEventDtoV1? started)
    {
        if (result is { } r)
        {
            return new JobOutcome(Time(r, "StartTime"), Time(r, "EndTime"), Number(r, "ProducedQuantity"), Number(r, "GoodQuantity"),
                Integer(r, "RunsCompleted"), Number(r, "ActualProductionTime"), Text(r, "JobResult"));
        }
        if (started is { } s)
        {
            return new JobOutcome(Time(s.Data, "StateSince") ?? s.Time, null, 0, 0, 0, 0, "Unknown");
        }
        return new JobOutcome(null, null, null, null, null, null, null);
    }

    private sealed record JobOutcome(
        DateTime? StartTime, DateTime? EndTime, double? ProducedQuantity, double? GoodQuantity,
        long? RunsCompleted, double? ActualProductionTime, string? JobResult);

    /// <summary>One job order with its events and its program executions, oldest first; null if no event names it.</summary>
    public static JobOrderHistoryDtoV1? History(
        IEnumerable<MachineEventDtoV1> jobEvents, IEnumerable<MachineEventDtoV1> workMasterEvents, string mId, string jobOrderId)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var history = jobEvents
            .Where(e => e.MId == mId && e.Type.StartsWith(JobOrderPrefix, StringComparison.Ordinal) && Text(e.Data, "JobOrderID") == jobOrderId)
            .OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal)
            .ToList();
        var ofJob = workMasterEvents.Where(e => e.MId == mId && Text(e.Data, "JobOrderID") == jobOrderId).ToList();
        var jobOrder = JobOrders(history, ofJob).SingleOrDefault();
        return jobOrder is null
            ? null
            : new JobOrderHistoryDtoV1
            {
                JobOrder = jobOrder,
                History = history,
                ProgramExecutions = [.. ProgramExecutions(ofJob).OrderBy(p => p.StartTime)],
            };
    }

    // ─── gaps ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// The gaps in the numbers of the events: per machine, group and run of the adapter (the prefix of
    /// <c>sequence</c>), every count that never arrived between two that did. With <paramref name="fromStart"/>, a
    /// run whose first event seen is not number 1 also has a gap before it.
    /// </summary>
    public static List<SequenceGapDtoV1> Gaps(IEnumerable<MachineEventDao> events, bool fromStart)
    {
        ArgumentNullException.ThrowIfNull(events);
        var gaps = new List<SequenceGapDtoV1>();
        foreach (var run in events
            .Where(e => e.SequencePrefix is not null && e.SequenceCount is not null)
            .GroupBy(e => (e.MId, e.Group, Prefix: e.SequencePrefix!))
            .OrderBy(g => g.Key.MId, StringComparer.Ordinal).ThenBy(g => g.Key.Group, StringComparer.Ordinal).ThenBy(g => g.Key.Prefix, StringComparer.Ordinal))
        {
            var counts = run.Select(e => e.SequenceCount!.Value).Distinct().Order().ToList();
            var previous = fromStart ? 0 : counts[0];
            foreach (var count in counts)
            {
                if (count > previous + 1)
                {
                    gaps.Add(new SequenceGapDtoV1
                    {
                        MId = run.Key.MId,
                        Group = run.Key.Group,
                        Prefix = run.Key.Prefix,
                        FirstMissing = previous + 1,
                        LastMissing = count - 1,
                        Missing = count - 1 - previous,
                    });
                }
                previous = count;
            }
        }
        return gaps;
    }

    // ─── paging ────────────────────────────────────────────────────────────────

    /// <summary>A page of a view, sorted by the given key and direction.</summary>
    public static (List<T> Items, long TotalCount) Page<T, TKey>(List<T> items, Func<T, TKey> key, PagedRequest paging)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentNullException.ThrowIfNull(paging);
        var sorted = paging.Sorting == Sorting.Ascending ? items.OrderBy(key) : items.OrderByDescending(key);
        return ([.. sorted.Skip(paging.Skip).Take(paging.Take)], items.Count);
    }

    // ─── reading data ──────────────────────────────────────────────────────────

    private static string? Text(JsonElement data, string name)
    {
        return data.ValueKind == JsonValueKind.Object && data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static double? Number(JsonElement data, string name)
    {
        return data.ValueKind == JsonValueKind.Object && data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;
    }

    private static long? Integer(JsonElement data, string name)
    {
        return Number(data, name) is { } number ? (long)Math.Round(number) : null;
    }

    private static DateTime? Time(JsonElement data, string name)
    {
        return Text(data, name) is { } text && DateTime.TryParse(text, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var time)
            ? time
            : null;
    }
}
