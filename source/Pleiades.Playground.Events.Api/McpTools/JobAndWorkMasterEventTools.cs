// SPDX-License-Identifier: Apache-2.0
using System.ComponentModel;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Endpoints;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.JobEvent;
using Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.McpTools;

[McpServerToolType]
internal sealed class JobAndWorkMasterEventTools(IJobEventRepository jobEvents, IWorkMasterEventRepository workMasterEvents)
{
    [McpServerTool(Name = "events_job_events_query", ReadOnly = true),
     Description(
         "Search job events of industrial machines: what happened to job orders. The action is named after the state " +
         "reached (Added, Released, Revoked, Started, Interrupted, Resumed, Ended, Aborted, Cancelled, Removed), or is " +
         "Changed (the order changed) or ResultChanged (a quantity or the end changed). Each event carries the whole job " +
         "order after it: what is ordered (jobName, workMasterId, runsPlanned, orderNumbers) and, from its start, its " +
         "result (startTime, endTime, producedQuantity, goodQuantity, runsCompleted, jobResult). Times in seconds. " +
         "Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<JobEventDtoV1>> QueryJobEvents(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to search all machines.")] string? mId = null,
        [Description("Action filter, e.g. Started, ResultChanged or Ended")] string? action = null,
        [Description("Job order filter (e.g. '4711/01')")] string? jobOrderId = null,
        [Description("Start of time range (ISO 8601, e.g. '2026-11-17T06:00:00Z')")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601, e.g. '2026-11-17T18:00:00Z')")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by timestamp: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var filter = new JobEventFilter(mId, EventToolArguments.ParseEnum<JobAction>(action, nameof(action)), jobOrderId, fromDate, toDate);
        var (items, totalCount) = await jobEvents.QueryEventsWithPaginationAsync(
            filter, page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection), cancellationToken).ConfigureAwait(false);
        return new PagedResponse<JobEventDtoV1>(EventsMapper.Map(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_job_orders_query", ReadOnly = true),
     Description(
         "List job orders of industrial machines with their last known state, put together from their job events: " +
         "state (NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended, Aborted), what is ordered (work master, " +
         "runs planned), the result (start and end time, produced and good quantity, runs completed, jobResult), how many " +
         "program executions they had and the electric energy of those in joule. " +
         "Answers questions like 'which job orders did P-04 end today, with how many parts and how much energy?'. " +
         "The time range filters on the last change of a job order. Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<JobOrderDtoV1>> QueryJobOrders(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to list all machines.")] string? mId = null,
        [Description("State filter, e.g. Running, Ended or Aborted")] string? state = null,
        [Description("Earliest last change (ISO 8601)")] DateTime? fromDate = null,
        [Description("Latest last change (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by last change: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var jobOrders = await JobEvents.ReadJobOrdersAsync(jobEvents, workMasterEvents, mId, state, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = JobOrderProjections.Page(
            jobOrders, j => j.LastChange, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<JobOrderDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_work_master_events_query", ReadOnly = true),
     Description(
         "Search work master events of industrial machines: what happened to program executions, the machine carrying " +
         "out a work master. The action is Started, Interrupted, Resumed, Ended or Aborted; each event carries the " +
         "executionId (its correlationId), the workMasterId, the jobOrderId and the startTime, and Ended and Aborted the " +
         "duration in seconds, the parts produced and the energy in joule. Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<WorkMasterEventDtoV1>> QueryWorkMasterEvents(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to search all machines.")] string? mId = null,
        [Description("Action filter: Started, Interrupted, Resumed, Ended or Aborted")] string? action = null,
        [Description("Job order filter (e.g. '4711/01')")] string? jobOrderId = null,
        [Description("Work master filter (e.g. 'WM-SHAFT-4711')")] string? workMasterId = null,
        [Description("Start of time range (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by timestamp: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var filter = new WorkMasterEventFilter(
            mId, EventToolArguments.ParseEnum<WorkMasterAction>(action, nameof(action)), jobOrderId, workMasterId, fromDate, toDate);
        var (items, totalCount) = await workMasterEvents.QueryEventsWithPaginationAsync(
            filter, page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection), cancellationToken).ConfigureAwait(false);
        return new PagedResponse<WorkMasterEventDtoV1>(EventsMapper.Map(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_program_executions_query", ReadOnly = true),
     Description(
         "List program executions of industrial machines from start to end: the Started work master event paired with " +
         "the Ended or Aborted event by the executionId, with the work master, the job order, how often it was " +
         "interrupted, and at its end the duration in seconds (interruptions included), the parts produced and the " +
         "electric energy in joule. A program execution without an end is still running or interrupted. Useful for " +
         "cycle times, energy per part and aborts. Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<ProgramExecutionPairDtoV1>> QueryProgramExecutions(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to search all machines.")] string? mId = null,
        [Description("Job order the program executions belong to (e.g. '4711/01')")] string? jobOrderId = null,
        [Description("Work master filter (e.g. 'WM-SHAFT-4711')")] string? workMasterId = null,
        [Description("Start of time range of the events (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range of the events (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by start time: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var pairs = await WorkMasterEvents.ReadProgramExecutionsAsync(workMasterEvents, mId, jobOrderId, workMasterId, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = JobOrderProjections.Page(
            pairs, p => p.StartTime, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<ProgramExecutionPairDtoV1>(items, totalCount, page.Skip, page.Take);
    }
}
