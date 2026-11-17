// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Projections;

/// <summary>
/// The views on job events and work master events, put together when they are read. Every event carries the whole
/// state after it, so the last event of a correlation id is the state, and a view needs no event before its time
/// range to be right.
/// </summary>
internal static class JobOrderProjections
{
    /// <summary>
    /// Pairs the events of each program execution by its execution id: the start, the end (Ended or Aborted) with
    /// its sums, how often it was interrupted, and its state after its last event.
    /// </summary>
    /// <param name="events">Work master events in any order.</param>
    public static List<ProgramExecutionPairDtoV1> PairProgramExecutions(IEnumerable<WorkMasterEventDtoV1> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        return [.. events
            .Where(e => !string.IsNullOrEmpty(e.CorrelationId))
            .GroupBy(e => (e.MId, e.CorrelationId))
            .Select(group =>
            {
                var ordered = group.OrderBy(e => e.Timestamp).ThenBy(e => e.Seq ?? 0).ToList();
                var last = ordered[^1];
                var end = ordered.LastOrDefault(e => e.Action is WorkMasterAction.Ended or WorkMasterAction.Aborted);
                return new ProgramExecutionPairDtoV1
                {
                    ExecutionId = group.Key.CorrelationId,
                    MId = group.Key.MId,
                    JobOrderId = ordered.Select(e => e.JobOrderId).LastOrDefault(id => id is not null),
                    WorkMasterId = ordered.Select(e => e.WorkMasterId).LastOrDefault(w => w is not null),
                    State = last.State,
                    StartTime = last.StartTime,
                    EndTime = end?.Timestamp,
                    EndAction = end?.Action,
                    Interruptions = ordered.Count(e => e.Action == WorkMasterAction.Interrupted),
                    Duration = end?.Duration,
                    PartsProduced = end?.PartsProduced,
                    EnergyElectricity = end?.EnergyElectricity,
                    EnergyCompressedAir = end?.EnergyCompressedAir,
                };
            })];
    }

    /// <summary>
    /// The last known state of each job order: what is ordered and what came of it after its last event, with the
    /// number of its program executions and the energy of those that ended.
    /// </summary>
    /// <param name="jobEvents">Job events in any order.</param>
    /// <param name="workMasterEvents">Work master events in any order; those of a job order count for it.</param>
    public static List<JobOrderDtoV1> JobOrders(IEnumerable<JobEventDtoV1> jobEvents, IEnumerable<WorkMasterEventDtoV1> workMasterEvents)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var executions = PairProgramExecutions(workMasterEvents)
            .Where(p => p.JobOrderId is not null)
            .ToLookup(p => (p.MId, JobOrderId: p.JobOrderId!));

        return [.. jobEvents
            .Where(e => !string.IsNullOrEmpty(e.CorrelationId))
            .GroupBy(e => (e.MId, JobOrderId: e.CorrelationId))
            .Select(group =>
            {
                var ordered = InOrder(group);
                var last = ordered[^1];
                var ofJob = executions[group.Key].ToList();
                return new JobOrderDtoV1
                {
                    MId = group.Key.MId,
                    JobOrderId = group.Key.JobOrderId,
                    State = last.State,
                    LastAction = last.Action,
                    LastChange = last.Timestamp,
                    FirstSeen = ordered[0].Timestamp,
                    Removed = last.Action == JobAction.Removed,
                    JobName = last.JobName,
                    WorkMasterId = last.WorkMasterId,
                    OrderNumbers = last.OrderNumbers,
                    RunsPlanned = last.RunsPlanned,
                    JobExecutionMode = last.JobExecutionMode,
                    PlannedStartTime = last.PlannedStartTime,
                    PlannedEndTime = last.PlannedEndTime,
                    StartTime = last.StartTime,
                    EndTime = last.EndTime,
                    ProducedQuantity = last.ProducedQuantity,
                    GoodQuantity = last.GoodQuantity,
                    RunsCompleted = last.RunsCompleted,
                    ActualProductionTime = last.ActualProductionTime,
                    JobResult = last.JobResult,
                    ProgramExecutions = ofJob.Count,
                    EnergyElectricity = ofJob.Sum(p => p.EnergyElectricity ?? 0),
                    EnergyCompressedAir = ofJob.Sum(p => p.EnergyCompressedAir ?? 0),
                };
            })];
    }

    /// <summary>
    /// One job order with its job events and its program executions, oldest first; null if no job event names it.
    /// </summary>
    public static JobOrderHistoryDtoV1? History(
        IEnumerable<JobEventDtoV1> jobEvents, IEnumerable<WorkMasterEventDtoV1> workMasterEvents, string mId, string jobOrderId)
    {
        ArgumentNullException.ThrowIfNull(jobEvents);
        ArgumentNullException.ThrowIfNull(workMasterEvents);
        var history = InOrder(jobEvents.Where(e => e.MId == mId && e.CorrelationId == jobOrderId));
        var ofJob = workMasterEvents.Where(e => e.MId == mId && e.JobOrderId == jobOrderId).ToList();
        var jobOrder = JobOrders(history, ofJob).SingleOrDefault();
        return jobOrder is null
            ? null
            : new JobOrderHistoryDtoV1
            {
                JobOrder = jobOrder,
                History = history,
                ProgramExecutions = [.. PairProgramExecutions(ofJob).OrderBy(p => p.StartTime)],
            };
    }

    /// <summary>A page of a view, sorted by the given key and direction.</summary>
    public static (List<T> Items, long TotalCount) Page<T, TKey>(List<T> items, Func<T, TKey> key, PagedRequest paging)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentNullException.ThrowIfNull(paging);
        var sorted = paging.Sorting == Sorting.Ascending ? items.OrderBy(key) : items.OrderByDescending(key);
        return ([.. sorted.Skip(paging.Skip).Take(paging.Take)], items.Count);
    }

    // The order the events came up: by time, and within the same time by the number of the source.
    private static List<JobEventDtoV1> InOrder(IEnumerable<JobEventDtoV1> events)
    {
        return [.. events.OrderBy(e => e.Timestamp).ThenBy(e => e.Seq ?? 0)];
    }
}
