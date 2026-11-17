// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Projections;

/// <summary>
/// The views on production events, put together when they are read. Every event carries the whole state after it,
/// so the last event of a correlation id is the state, and a view needs no event before its time range to be right.
/// </summary>
internal static class ProductionEventProjections
{
    /// <summary>
    /// Pairs the events of each program execution by its execution id: the start, the end (Ended or Aborted) with
    /// its sums, how often it was interrupted, and its state after its last event.
    /// </summary>
    /// <param name="events">Production events in any order; events of job orders are left out.</param>
    public static List<ProgramExecutionPairDtoV1> PairProgramExecutions(IEnumerable<ProductionEventDtoV1> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        return [.. events
            .Where(e => e.Subject == ProductionSubject.ProgramExecution && !string.IsNullOrEmpty(e.CorrelationId))
            .GroupBy(e => (e.MId, e.CorrelationId))
            .Select(group =>
            {
                var ordered = InOrder(group);
                var last = ordered[^1];
                var end = ordered.LastOrDefault(e => e.Action is ProductionAction.Ended or ProductionAction.Aborted);
                var start = ordered.FirstOrDefault(e => e.Action == ProductionAction.Started);
                return new ProgramExecutionPairDtoV1
                {
                    ExecutionId = group.Key.CorrelationId,
                    MId = group.Key.MId,
                    JobOrderId = ordered.Select(e => e.JobOrderId).LastOrDefault(id => id is not null),
                    WorkMaster = ordered.Select(e => e.WorkMaster).LastOrDefault(w => w is not null),
                    State = last.State,
                    StartTime = ordered.Select(e => e.StartTime).LastOrDefault(t => t is not null) ?? start?.Timestamp ?? ordered[0].Timestamp,
                    EndTime = end?.Timestamp,
                    EndAction = end?.Action,
                    Interruptions = ordered.Count(e => e.Action == ProductionAction.Interrupted),
                    Duration = end?.Duration,
                    PartsProduced = end?.PartsProduced,
                    EnergyElectricity = end?.EnergyElectricity,
                    EnergyCompressedAir = end?.EnergyCompressedAir,
                };
            })];
    }

    /// <summary>
    /// The last known state of each job order: state, times and quantities of its last event, with the number of its
    /// program executions and the energy of those that ended.
    /// </summary>
    /// <param name="events">Production events in any order, those of the job orders and of their program executions.</param>
    public static List<JobOrderDtoV1> JobOrders(IEnumerable<ProductionEventDtoV1> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        var all = events.ToList();
        var executions = PairProgramExecutions(all)
            .Where(p => p.JobOrderId is not null)
            .ToLookup(p => (p.MId, JobOrderId: p.JobOrderId!));

        return [.. all
            .Where(e => e.Subject == ProductionSubject.JobOrder && !string.IsNullOrEmpty(e.CorrelationId))
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
                    Removed = last.Action == ProductionAction.Removed,
                    WorkMaster = ofJob.OrderBy(p => p.StartTime).Select(p => p.WorkMaster).LastOrDefault(w => w is not null),
                    StartTime = last.StartTime,
                    EndTime = last.EndTime,
                    ProducedQuantity = last.ProducedQuantity,
                    GoodQuantity = last.GoodQuantity,
                    ProgramExecutions = ofJob.Count,
                    EnergyElectricity = ofJob.Sum(p => p.EnergyElectricity ?? 0),
                    EnergyCompressedAir = ofJob.Sum(p => p.EnergyCompressedAir ?? 0),
                };
            })];
    }

    /// <summary>One job order with its events and those of its program executions, oldest first; null if it has none.</summary>
    public static JobOrderHistoryDtoV1? History(IEnumerable<ProductionEventDtoV1> events, string mId, string jobOrderId)
    {
        ArgumentNullException.ThrowIfNull(events);
        var history = InOrder(events.Where(e => e.MId == mId && (e.JobOrderId == jobOrderId
            || (e.Subject == ProductionSubject.JobOrder && e.CorrelationId == jobOrderId))));
        var jobOrder = JobOrders(history).SingleOrDefault();
        return jobOrder is null ? null : new JobOrderHistoryDtoV1 { JobOrder = jobOrder, History = history };
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
    private static List<ProductionEventDtoV1> InOrder(IEnumerable<ProductionEventDtoV1> events)
    {
        return [.. events.OrderBy(e => e.Timestamp).ThenBy(e => e.Seq ?? 0)];
    }
}
