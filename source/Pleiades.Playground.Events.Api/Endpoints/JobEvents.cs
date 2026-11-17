// SPDX-License-Identifier: Apache-2.0
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.JobEvent;
using Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>Endpoints of job events, and of the job orders put together from them.</summary>
internal static class JobEvents
{
    /// <summary>Maps the endpoints of <c>/jobEvents</c>.</summary>
    internal static RouteGroupBuilder MapJobEvents(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetJobEvents)
            .WithName("GetJobEvents")
            .WithSummary("Retrieves job events with pagination and optional filters")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapPost("", PostJobEvent)
            .WithName("PostJobEvent")
            .WithSummary("Creates a new job event")
            .RequireFeatureWrite(EventsFeature.Name);

        group.MapPost("/bulk", BulkPostJobEvents)
            .WithName("BulkPostJobEvents")
            .WithSummary("Creates multiple job events in bulk")
            .RequireFeatureWrite(EventsFeature.Name);

        return group;
    }

    /// <summary>Maps the endpoints of <c>/jobOrders</c>.</summary>
    internal static RouteGroupBuilder MapJobOrders(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetJobOrders)
            .WithName("GetJobOrders")
            .WithSummary("Retrieves the last known state of each job order, its result included, put together from its job events")
            .RequireFeatureRead(EventsFeature.Name);

        // A job order id may contain '/', such as 4711/01: the catch-all takes the rest of the path as it is.
        group.MapGet("/{mId}/{**jobOrderId}", GetJobOrder)
            .WithName("GetJobOrder")
            .WithSummary("Retrieves one job order with its result, the job events it went through and its program executions")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>Retrieves job events with pagination, optionally filtered.</summary>
    /// <param name="mId">Optional machine identifier. Example: P-04</param>
    /// <param name="action">Optional action, such as Started, ResultChanged or Ended.</param>
    /// <param name="jobOrderId">Optional job order. Example: 4711/01</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2026-11-17T06:00:00Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2026-11-17T18:00:00Z</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting).</param>
    /// <param name="repository">Repository of job events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of job events.</returns>
    internal static async Task<Ok<PagedResponse<JobEventDtoV1>>> GetJobEvents(
        [FromQuery] string? mId,
        [FromQuery] JobAction? action,
        [FromQuery] string? jobOrderId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IJobEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            new JobEventFilter(mId, action, jobOrderId, from, to),
            validatedPaging.Skip, validatedPaging.Take, validatedPaging.Sorting,
            cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(PagedResponse.Create(EventsMapper.Map(items), totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves the last known state of each job order, put together from its job events when it is read: what is
    /// ordered, what came of it, and what its program executions add up to.
    /// </summary>
    /// <param name="mId">Optional machine identifier.</param>
    /// <param name="state">Optional state after the last event, such as Running or Ended.</param>
    /// <param name="from">Optional earliest time of the last change (inclusive).</param>
    /// <param name="to">Optional latest time of the last change (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by the last change).</param>
    /// <param name="jobEvents">Repository of job events.</param>
    /// <param name="workMasterEvents">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of job orders.</returns>
    internal static async Task<Ok<PagedResponse<JobOrderDtoV1>>> GetJobOrders(
        [FromQuery] string? mId,
        [FromQuery] string? state,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IJobEventRepository jobEvents,
        IWorkMasterEventRepository workMasterEvents,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var jobOrders = await ReadJobOrdersAsync(jobEvents, workMasterEvents, mId, state, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = JobOrderProjections.Page(jobOrders, j => j.LastChange, validatedPaging);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves one job order: its last known state with its result, its job events and its program executions,
    /// oldest first.
    /// </summary>
    /// <param name="mId">Machine identifier. Example: P-04</param>
    /// <param name="jobOrderId">Job order, as the machine names it; it may contain '/'. Example: 4711/01</param>
    /// <param name="jobEvents">Repository of job events.</param>
    /// <param name="workMasterEvents">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The job order with its history, or 404 if no job event names it.</returns>
    internal static async Task<Results<Ok<JobOrderHistoryDtoV1>, NotFound>> GetJobOrder(
        string mId,
        string jobOrderId,
        IJobEventRepository jobEvents,
        IWorkMasterEventRepository workMasterEvents,
        CancellationToken cancellationToken)
    {
        var jobs = await jobEvents.FindForViewAsync(new JobEventFilter(MId: mId, JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var executions = await workMasterEvents.FindForViewAsync(new WorkMasterEventFilter(MId: mId, JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var history = JobOrderProjections.History(EventsMapper.Map(jobs), EventsMapper.Map(executions), mId, jobOrderId);
        return history is null ? TypedResults.NotFound() : TypedResults.Ok(history);
    }

    /// <summary>Creates a new job event.</summary>
    /// <param name="dto">The job event.</param>
    /// <param name="repository">Repository of job events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response with the created event, or 409 when an event with its id exists.</returns>
    internal static async Task<Results<Created<JobEventDtoV1>, Conflict<string>>> PostJobEvent(
        JobEventDtoV1 dto,
        IJobEventRepository repository,
        CancellationToken cancellationToken)
    {
        var dao = EventsMapper.Map(dto);
        try
        {
            await repository.CreateAsync(dao, cancellationToken).ConfigureAwait(false);
        }
        catch (PleiadesDuplicateDataException ex)
        {
            return TypedResults.Conflict(ex.Message);
        }

        return TypedResults.Created(new Uri($"/{Uri.EscapeDataString(dao.Id)}", UriKind.Relative), dto);
    }

    /// <summary>Creates multiple job events in bulk.</summary>
    /// <param name="dtos">The job events.</param>
    /// <param name="repository">Repository of job events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response on success, or 409 when some of them exist.</returns>
    internal static async Task<Results<Created, Conflict<string>>> BulkPostJobEvents(
        List<JobEventDtoV1> dtos,
        IJobEventRepository repository,
        CancellationToken cancellationToken)
    {
        try
        {
            await repository.CreateManyAsync(EventsMapper.Map(dtos), cancellationToken).ConfigureAwait(false);
        }
        catch (PleiadesDuplicateDataException ex)
        {
            return TypedResults.Conflict($"Duplicate entries detected: {ex.Message}");
        }

        return TypedResults.Created(new Uri("/bulk", UriKind.Relative));
    }

    /// <summary>
    /// The job orders of a machine, put together from all their job events and the work master events of the
    /// machine, and kept when their last change lies in the range and their state matches.
    /// </summary>
    internal static async Task<List<JobOrderDtoV1>> ReadJobOrdersAsync(
        IJobEventRepository jobEvents, IWorkMasterEventRepository workMasterEvents,
        string? mId, string? state, DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        // The state of a job order needs all its events, not only those in the range: read them all, then filter.
        var jobs = await jobEvents.FindForViewAsync(new JobEventFilter(MId: mId), cancellationToken).ConfigureAwait(false);
        var executions = await workMasterEvents.FindForViewAsync(new WorkMasterEventFilter(MId: mId), cancellationToken).ConfigureAwait(false);
        return [.. JobOrderProjections.JobOrders(EventsMapper.Map(jobs), EventsMapper.Map(executions))
            .Where(j => string.IsNullOrEmpty(state) || string.Equals(j.State, state, StringComparison.OrdinalIgnoreCase))
            .Where(j => from is null || j.LastChange >= from)
            .Where(j => to is null || j.LastChange <= to)];
    }
}
