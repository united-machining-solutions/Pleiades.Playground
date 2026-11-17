// SPDX-License-Identifier: Apache-2.0
using System.ComponentModel;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Endpoints;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.ProductionEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.McpTools;

[McpServerToolType]
internal sealed class ProductionEventTools(IProductionEventRepository repository)
{
    [McpServerTool(Name = "events_production_query", ReadOnly = true),
     Description(
         "Search production events of industrial machines: what happened to job orders and program executions. " +
         "Each event has a subject (JobOrder or ProgramExecution) and an action named after the state reached " +
         "(job orders: Added, Released, Revoked, Started, Interrupted, Resumed, Ended, Aborted, Cancelled, Changed, Removed; " +
         "program executions: Started, Interrupted, Resumed, Ended, Aborted), and carries the whole state after it. " +
         "The correlationId is the jobOrderId of a job order and the executionId of a program execution. " +
         "Duration is in seconds, energy in joule. Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<ProductionEventDtoV1>> QueryProductionEvents(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to search all machines.")] string? mId = null,
        [Description("Subject filter: JobOrder or ProgramExecution")] string? subject = null,
        [Description("Action filter, e.g. Started, Ended or Aborted")] string? action = null,
        [Description("Job order filter (e.g. '4711/01'): its events and those of its program executions")] string? jobOrderId = null,
        [Description("Start of time range (ISO 8601, e.g. '2026-11-17T06:00:00Z')")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601, e.g. '2026-11-17T18:00:00Z')")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by timestamp: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var filter = new ProductionEventFilter(
            mId,
            EventToolArguments.ParseEnum<ProductionSubject>(subject, nameof(subject)),
            EventToolArguments.ParseEnum<ProductionAction>(action, nameof(action)),
            jobOrderId, fromDate, toDate);
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            filter, page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection), cancellationToken).ConfigureAwait(false);
        return new PagedResponse<ProductionEventDtoV1>(EventsMapper.Map(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_job_orders_query", ReadOnly = true),
     Description(
         "List job orders of industrial machines with their last known state, put together from their production events: " +
         "state (NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended, Aborted), start and end time, produced and good " +
         "quantity, how many program executions they had and the electric energy of those in joule. " +
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
        var jobOrders = await ProductionEvents.ReadJobOrdersAsync(repository, mId, state, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = ProductionEventProjections.Page(
            jobOrders, j => j.LastChange, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<JobOrderDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_program_executions_query", ReadOnly = true),
     Description(
         "List program executions of industrial machines from start to end: the Started event paired with the Ended or " +
         "Aborted event by the executionId, with the work master (program), the job order, how often it was interrupted, " +
         "and at its end the duration in seconds (interruptions included), the parts produced and the electric energy in joule. " +
         "A program execution without an end is still running or interrupted. Useful for cycle times, energy per part and aborts. " +
         "Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<ProgramExecutionPairDtoV1>> QueryProgramExecutions(
        [Description("Machine ID, the serial number (e.g. 'P-04'). Omit to search all machines.")] string? mId = null,
        [Description("Job order the program executions belong to (e.g. '4711/01')")] string? jobOrderId = null,
        [Description("Start of time range of the events (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range of the events (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by start time: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var pairs = await ProductionEvents.ReadProgramExecutionsAsync(repository, mId, jobOrderId, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = ProductionEventProjections.Page(
            pairs, p => p.StartTime, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<ProgramExecutionPairDtoV1>(items, totalCount, page.Skip, page.Take);
    }
}
