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

    /// <summary>What cleared an alert: its AlertCleared.</summary>
    public const string ByEvent = "Event";

    /// <summary>
    /// What ended an alert or a program execution that was open when the adapter started anew and that the new run
    /// did not name again: the start of the next run.
    /// </summary>
    public const string AdapterRestart = "AdapterRestart";

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
    /// <param name="runs">
    /// The runs of the adapters and the gaps in them: an alert that stands in an earlier run than the newest of its
    /// machine is cleared by <see cref="AdapterRestart"/> at the start of the next run, one with a gap after its
    /// last event is <see cref="AlertDtoV1.Stale"/>. Null to read the events alone.
    /// </param>
    public static List<AlertPairDtoV1> AlertPairs(
        IEnumerable<MachineEventDtoV1> events, DateTime? from = null, DateTime? to = null, RunContext? runs = null)
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
                var clearedBy = cleared is null ? null : ByEvent;
                var stale = false;
                if (cleared is null && runs?.After(last) is { } after)
                {
                    (clearedAt, clearedBy, stale) = after.NextRunStart is { } next
                        ? (Later(next, last.Time), AdapterRestart, false)
                        : ((DateTime?)null, (string?)null, after.Gap);
                }
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
                    Stale = stale,
                    ClearedAt = clearedAt,
                    ClearedBy = clearedBy,
                    DurationSeconds = clearedAt is { } end ? Math.Round((end - raisedAt).TotalSeconds, 3) : null,
                };
            })
            .Where(p => (to is null || p.RaisedAt <= to) && (from is null || p.ClearedAt is null || p.ClearedAt >= from))
            .OrderBy(p => p.RaisedAt)];
    }

    /// <summary>The alerts that stand now: raised, not cleared, and not cleared by a restart of the adapter.</summary>
    public static List<AlertDtoV1> ActiveAlerts(IEnumerable<MachineEventDtoV1> events, RunContext? runs = null)
    {
        return [.. AlertPairs(events, runs: runs).Where(p => p.ClearedAt is null).Select(p => (AlertDtoV1)p with { })];
    }

    /// <summary>
    /// The alerts that stood in the range, by severity, in the order of NE 107. An alert cleared by a restart of the
    /// adapter counts until the start of the next run, at most as long as it stood.
    /// </summary>
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
    /// <param name="runs">
    /// The runs of the adapters and the gaps in them: an execution without an end in an earlier run than the newest
    /// of its machine ends with <see cref="AdapterRestart"/> at the start of the next run, without sums; one with a
    /// gap after its last event is <see cref="ProgramExecutionDtoV1.Stale"/>. Null to read the events alone.
    /// </param>
    public static List<ProgramExecutionDtoV1> ProgramExecutions(IEnumerable<MachineEventDtoV1> events, RunContext? runs = null)
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
                DateTime? endTime = end?.Time;
                var endType = end?.Type[ProgramExecutionPrefix.Length..];
                var stale = false;
                if (end is null && runs?.After(last) is { } after)
                {
                    (endTime, endType, stale) = after.NextRunStart is { } next
                        ? (Later(next, last.Time), AdapterRestart, false)
                        : ((DateTime?)null, (string?)null, after.Gap);
                }
                return new ProgramExecutionDtoV1
                {
                    MId = group.Key.MId,
                    ExecutionId = group.Key.ExecutionId,
                    JobOrderId = ordered.Select(e => Text(e.Data, "JobOrderID")).LastOrDefault(id => id is not null),
                    WorkMasterId = ordered.Select(e => Text(e.Data, "ActiveWorkMaster")).LastOrDefault(w => w is not null),
                    State = Text(last.Data, "State") ?? string.Empty,
                    StartTime = Time(last.Data, "StartTime") ?? ordered[0].Time,
                    EndTime = endTime,
                    EndType = endType,
                    Stale = stale,
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
    /// <param name="runs">
    /// The runs of the adapters and the gaps in them: a job order that has not ended is
    /// <see cref="JobOrderDtoV1.Stale"/> when the adapter started anew since its last event, or a gap follows it. It
    /// is not closed: a job order outlives its adapter. Null to read the events alone.
    /// </param>
    public static List<JobOrderDtoV1> JobOrders(
        IEnumerable<MachineEventDtoV1> jobEvents, IEnumerable<MachineEventDtoV1> workMasterEvents, RunContext? runs = null)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var executions = ProgramExecutions(workMasterEvents, runs)
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
                var state = order is { } o ? Text(o, "State") ?? string.Empty : string.Empty;
                var removed = last.Type == JobOrderRemoved;
                var ended = removed || state is "Ended" or "Aborted";
                return new JobOrderDtoV1
                {
                    MId = group.Key.MId,
                    JobOrderId = group.Key.JobOrderId,
                    State = state,
                    LastType = last.Type,
                    LastChange = last.Time,
                    FirstSeen = ordered[0].Time,
                    Removed = removed,
                    Stale = !ended && runs?.After(last) is { } after && (after.NextRunStart is not null || after.Gap),
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
        IEnumerable<MachineEventDtoV1> jobEvents, IEnumerable<MachineEventDtoV1> workMasterEvents, string mId, string jobOrderId,
        RunContext? runs = null)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var history = jobEvents
            .Where(e => e.MId == mId && e.Type.StartsWith(JobOrderPrefix, StringComparison.Ordinal) && Text(e.Data, "JobOrderID") == jobOrderId)
            .OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal)
            .ToList();
        var ofJob = workMasterEvents.Where(e => e.MId == mId && Text(e.Data, "JobOrderID") == jobOrderId).ToList();
        var jobOrder = JobOrders(history, ofJob, runs).SingleOrDefault();
        return jobOrder is null
            ? null
            : new JobOrderHistoryDtoV1
            {
                JobOrder = jobOrder,
                History = history,
                ProgramExecutions = [.. ProgramExecutions(ofJob, runs).OrderBy(p => p.StartTime)],
            };
    }

    // ─── gaps ──────────────────────────────────────────────────────────────────

    /// <summary>The format of the prefix of <c>sequence</c>: the start of the adapter, in UTC to the second.</summary>
    public const string RunStartFormat = "yyyyMMdd'T'HHmmss'Z'";

    /// <summary>The start of a run of the adapter, read from the prefix of <c>sequence</c>; null for another format.</summary>
    public static DateTime? RunStart(string prefix)
    {
        return DateTime.TryParseExact(prefix, RunStartFormat, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var start)
            ? start
            : null;
    }

    /// <summary>The runs of stored events, as <see cref="Repositories.MachineEvent.IMachineEventRepository.FindRunsAsync"/> gives them.</summary>
    public static List<SequenceRun> Runs(IEnumerable<MachineEventDao> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        return [.. events
            .Where(e => e.SequencePrefix is not null && e.SequenceCount is not null)
            .GroupBy(e => (e.MId, e.Group, Prefix: e.SequencePrefix!))
            .Select(g => new SequenceRun(g.Key.MId, g.Key.Group, g.Key.Prefix,
                g.Min(e => e.SequenceCount!.Value), g.Max(e => e.SequenceCount!.Value), g.LongCount(),
                g.Min(e => e.Time), g.Max(e => e.Time)))];
    }

    /// <summary>
    /// The gaps in the numbers of the events: per machine, group and run of the adapter (the prefix of
    /// <c>sequence</c>), every count that never arrived between two that did, and the counts before the first one
    /// that arrived when <paramref name="startVisible"/> says the start of the run lies in what is stored and read.
    /// </summary>
    /// <param name="runs">The runs that were read.</param>
    /// <param name="countsOf">The counts of a run that is not complete (<see cref="SequenceRun.IsComplete"/>).</param>
    /// <param name="startVisible">Whether the counts from 1 of a run would be stored and read, had they arrived.</param>
    public static List<SequenceGapDtoV1> Gaps(
        IEnumerable<SequenceRun> runs, Func<SequenceRun, IReadOnlyCollection<long>> countsOf, Func<SequenceRun, bool> startVisible)
    {
        ArgumentNullException.ThrowIfNull(runs);
        ArgumentNullException.ThrowIfNull(countsOf);
        ArgumentNullException.ThrowIfNull(startVisible);
        var gaps = new List<SequenceGapDtoV1>();
        foreach (var run in runs
            .OrderBy(r => r.MId, StringComparer.Ordinal).ThenBy(r => r.Group, StringComparer.Ordinal).ThenBy(r => r.Prefix, StringComparer.Ordinal))
        {
            if (run.FirstCount > 1 && startVisible(run))
            {
                gaps.Add(Gap(run, 0, run.FirstCount));
            }
            if (run.IsComplete)
            {
                continue;
            }
            var previous = run.FirstCount;
            foreach (var count in countsOf(run).Distinct().Order())
            {
                if (count > previous + 1)
                {
                    gaps.Add(Gap(run, previous, count));
                }
                previous = count;
            }
        }
        return gaps;
    }

    /// <summary>
    /// Whether the counts from 1 of a run would be stored and read, had they arrived: its start is known from its
    /// prefix, lies after the oldest time the retention keeps (events of a run are never older than its start), and
    /// is not before <paramref name="from"/>. Otherwise a run that begins later than 1 may have lost its first events
    /// to the retention or to the range, and nothing is said about them.
    /// </summary>
    public static bool StartVisible(SequenceRun run, DateTime now, TimeSpan? retention, DateTime? from)
    {
        ArgumentNullException.ThrowIfNull(run);
        return RunStart(run.Prefix) is { } start
            && (retention is not { } kept || start > now - kept)
            && (from is null || from <= start);
    }

    private static SequenceGapDtoV1 Gap(SequenceRun run, long previous, long next)
    {
        return new SequenceGapDtoV1
        {
            MId = run.MId,
            Group = run.Group,
            Prefix = run.Prefix,
            FirstMissing = previous + 1,
            LastMissing = next - 1,
            Missing = next - 1 - previous,
        };
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

    /// <summary>The prefix and the count of a <c>sequence</c>; nulls when it has no count after a dot.</summary>
    public static (string? Prefix, long? Count) SequenceOf(string? sequence)
    {
        var dot = sequence?.LastIndexOf('.') ?? -1;
        return sequence is not null && dot > 0
            && long.TryParse(sequence[(dot + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var count)
            ? (sequence[..dot], count)
            : (null, null);
    }

    /// <summary>The later of two times: an end is never before the last event.</summary>
    private static DateTime Later(DateTime a, DateTime b) => a > b ? a : b;

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

/// <summary>One run of the adapter in one group of a machine: the counts of <c>sequence</c> stored for it.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="Group">Group of events.</param>
/// <param name="Prefix">The prefix of <c>sequence</c>, the start of the adapter.</param>
/// <param name="FirstCount">The lowest count stored.</param>
/// <param name="LastCount">The highest count stored.</param>
/// <param name="Count">How many events are stored.</param>
/// <param name="FirstTime">The time of the oldest event.</param>
/// <param name="LastTime">The time of the newest event.</param>
internal sealed record SequenceRun(
    string MId, string Group, string Prefix, long FirstCount, long LastCount, long Count, DateTime FirstTime, DateTime LastTime)
{
    /// <summary>True when no count is missing between the first and the last (a count is stored once).</summary>
    public bool IsComplete => Count == LastCount - FirstCount + 1;
}

/// <summary>
/// The runs of the adapters, per machine in the order they started, and the gaps in their numbers: what the views
/// need to tell whether an alert, a program execution or a job order may have ended unseen.
/// </summary>
internal sealed class RunContext
{
    private readonly Dictionary<string, List<(string Prefix, DateTime Start)>> _runs;
    private readonly ILookup<(string MId, string Group, string Prefix), SequenceGapDtoV1> _gaps;

    private RunContext(Dictionary<string, List<(string Prefix, DateTime Start)>> runs, ILookup<(string, string, string), SequenceGapDtoV1> gaps)
    {
        _runs = runs;
        _gaps = gaps;
    }

    /// <summary>
    /// The runs of every group taken together per machine: one start of the adapter is one prefix in all groups. A
    /// run starts at the time its prefix names, or, in another format, with its first event.
    /// </summary>
    /// <param name="runs">The runs of the machines, of all groups.</param>
    /// <param name="gaps">The gaps inside the runs.</param>
    public static RunContext From(IEnumerable<SequenceRun> runs, IEnumerable<SequenceGapDtoV1> gaps)
    {
        ArgumentNullException.ThrowIfNull(runs);
        ArgumentNullException.ThrowIfNull(gaps);
        var byMachine = runs
            .GroupBy(r => r.MId, StringComparer.Ordinal)
            .ToDictionary(
                m => m.Key,
                m => m.GroupBy(r => r.Prefix, StringComparer.Ordinal)
                    .Select(p => (Prefix: p.Key, Start: MachineEventViews.RunStart(p.Key) ?? p.Min(r => r.FirstTime)))
                    .OrderBy(p => p.Start).ThenBy(p => p.Prefix, StringComparer.Ordinal)
                    .ToList(),
                StringComparer.Ordinal);
        return new RunContext(byMachine, gaps.ToLookup(g => (g.MId, g.Group, g.Prefix)));
    }

    /// <summary>
    /// What came after an event in its run and machine: the start of the next run, if the adapter started anew since,
    /// and whether a count of its group is missing after it in its own run. Null when the event has no
    /// <c>sequence</c> of a known run.
    /// </summary>
    public RunAfter? After(MachineEventDtoV1 last)
    {
        ArgumentNullException.ThrowIfNull(last);
        var (prefix, count) = MachineEventViews.SequenceOf(last.Sequence);
        if (prefix is null || count is null || !_runs.TryGetValue(last.MId, out var runs))
        {
            return null;
        }
        var index = runs.FindIndex(r => r.Prefix == prefix);
        if (index < 0)
        {
            return null;
        }
        DateTime? next = index + 1 < runs.Count ? runs[index + 1].Start : null;
        var gap = _gaps[(last.MId, last.Group, prefix)].Any(g => g.LastMissing > count);
        return new RunAfter(next, gap);
    }
}

/// <summary>What came after the last event of an entry.</summary>
/// <param name="NextRunStart">The start of the next run of the adapter; null when the event is in the newest run.</param>
/// <param name="Gap">Whether a count of its group is missing after it in its own run.</param>
internal sealed record RunAfter(DateTime? NextRunStart, bool Gap);
