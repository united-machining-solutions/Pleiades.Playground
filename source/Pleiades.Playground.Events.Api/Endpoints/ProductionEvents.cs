// SPDX-License-Identifier: Apache-2.0
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.ProductionEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>
/// Endpoints of production events, and of the program executions and job orders put together from them.
/// </summary>
internal static class ProductionEvents
{
    /// <summary>Maps the endpoints of <c>/productionEvents</c>.</summary>
    internal static RouteGroupBuilder MapProductionEvents(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetProductionEvents)
            .WithName("GetProductionEvents")
            .WithSummary("Retrieves production events with pagination and optional filters")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/correlationPairs", GetProgramExecutionPairs)
            .WithName("GetProgramExecutionPairs")
            .WithSummary("Retrieves program executions, Started paired with Ended or Aborted, with duration and sums")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapPost("", PostProductionEvent)
            .WithName("PostProductionEvent")
            .WithSummary("Creates a new production event")
            .RequireFeatureWrite(EventsFeature.Name);

        group.MapPost("/bulk", BulkPostProductionEvents)
            .WithName("BulkPostProductionEvents")
            .WithSummary("Creates multiple production events in bulk")
            .RequireFeatureWrite(EventsFeature.Name);

        return group;
    }

    /// <summary>Maps the endpoints of <c>/jobOrders</c>.</summary>
    internal static RouteGroupBuilder MapJobOrders(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetJobOrders)
            .WithName("GetJobOrders")
            .WithSummary("Retrieves the last known state of each job order, put together from its production events")
            .RequireFeatureRead(EventsFeature.Name);

        // A job order id may contain '/', such as 4711/01: the catch-all takes the rest of the path as it is.
        group.MapGet("/{mId}/{**jobOrderId}", GetJobOrder)
            .WithName("GetJobOrder")
            .WithSummary("Retrieves one job order with the events it and its program executions went through")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>
    /// Retrieves production events with pagination, optionally filtered.
    /// </summary>
    /// <param name="mId">Optional machine identifier. Example: P-04</param>
    /// <param name="subject">Optional subject: JobOrder or ProgramExecution.</param>
    /// <param name="action">Optional action, such as Started or Ended.</param>
    /// <param name="jobOrderId">Optional job order: its events and those of its program executions. Example: 4711/01</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2026-11-17T06:00:00Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2026-11-17T18:00:00Z</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting).</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of production events.</returns>
    internal static async Task<Ok<PagedResponse<ProductionEventDtoV1>>> GetProductionEvents(
        [FromQuery] string? mId,
        [FromQuery] ProductionSubject? subject,
        [FromQuery] ProductionAction? action,
        [FromQuery] string? jobOrderId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IProductionEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            new ProductionEventFilter(mId, subject, action, jobOrderId, from, to),
            validatedPaging.Skip, validatedPaging.Take, validatedPaging.Sorting,
            cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(PagedResponse.Create(EventsMapper.Map(items), totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves program executions: the events of each program execution paired by its execution id, Started with
    /// Ended or Aborted, with duration, parts and energy of its end. One that has not ended is still running.
    /// </summary>
    /// <param name="mId">Optional machine identifier.</param>
    /// <param name="jobOrderId">Optional job order the program executions belong to.</param>
    /// <param name="from">Optional start timestamp of the events (inclusive).</param>
    /// <param name="to">Optional end timestamp of the events (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by start time).</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of program executions.</returns>
    internal static async Task<Ok<PagedResponse<ProgramExecutionPairDtoV1>>> GetProgramExecutionPairs(
        [FromQuery] string? mId,
        [FromQuery] string? jobOrderId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IProductionEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var pairs = await ReadProgramExecutionsAsync(repository, mId, jobOrderId, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = ProductionEventProjections.Page(pairs, p => p.StartTime, validatedPaging);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves the last known state of each job order, put together from its production events when it is read.
    /// </summary>
    /// <param name="mId">Optional machine identifier.</param>
    /// <param name="state">Optional state after the last event, such as Running or Ended.</param>
    /// <param name="from">Optional earliest time of the last change (inclusive).</param>
    /// <param name="to">Optional latest time of the last change (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by the last change).</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of job orders.</returns>
    internal static async Task<Ok<PagedResponse<JobOrderDtoV1>>> GetJobOrders(
        [FromQuery] string? mId,
        [FromQuery] string? state,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IProductionEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var jobOrders = await ReadJobOrdersAsync(repository, mId, state, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = ProductionEventProjections.Page(jobOrders, j => j.LastChange, validatedPaging);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves one job order: its last known state and the events it and its program executions went through,
    /// oldest first.
    /// </summary>
    /// <param name="mId">Machine identifier. Example: P-04</param>
    /// <param name="jobOrderId">Job order, as the machine names it; it may contain '/'. Example: 4711/01</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The job order with its history, or 404 if no event names it.</returns>
    internal static async Task<Results<Ok<JobOrderHistoryDtoV1>, NotFound>> GetJobOrder(
        string mId,
        string jobOrderId,
        IProductionEventRepository repository,
        CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(new ProductionEventFilter(MId: mId, JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var history = ProductionEventProjections.History(EventsMapper.Map(events), mId, jobOrderId);
        return history is null ? TypedResults.NotFound() : TypedResults.Ok(history);
    }

    /// <summary>Creates a new production event.</summary>
    /// <param name="dto">The production event.</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response with the created event, or 409 when an event with its id exists.</returns>
    internal static async Task<Results<Created<ProductionEventDtoV1>, Conflict<string>>> PostProductionEvent(
        ProductionEventDtoV1 dto,
        IProductionEventRepository repository,
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

    /// <summary>Creates multiple production events in bulk.</summary>
    /// <param name="dtos">The production events.</param>
    /// <param name="repository">Repository of production events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response on success, or 409 when some of them exist.</returns>
    internal static async Task<Results<Created, Conflict<string>>> BulkPostProductionEvents(
        List<ProductionEventDtoV1> dtos,
        IProductionEventRepository repository,
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

    /// <summary>The program executions of the events in the range, put together.</summary>
    internal static async Task<List<ProgramExecutionPairDtoV1>> ReadProgramExecutionsAsync(
        IProductionEventRepository repository, string? mId, string? jobOrderId, DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(
            new ProductionEventFilter(mId, ProductionSubject.ProgramExecution, null, jobOrderId, from, to), cancellationToken).ConfigureAwait(false);
        return ProductionEventProjections.PairProgramExecutions(EventsMapper.Map(events));
    }

    /// <summary>
    /// The job orders of a machine, put together from all their events, and kept when their last change lies in the
    /// range and their state matches.
    /// </summary>
    internal static async Task<List<JobOrderDtoV1>> ReadJobOrdersAsync(
        IProductionEventRepository repository, string? mId, string? state, DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        // The state of a job order needs all its events, not only those in the range: read them all, then filter.
        var events = await repository.FindForViewAsync(new ProductionEventFilter(MId: mId), cancellationToken).ConfigureAwait(false);
        return [.. ProductionEventProjections.JobOrders(EventsMapper.Map(events))
            .Where(j => string.IsNullOrEmpty(state) || string.Equals(j.State, state, StringComparison.OrdinalIgnoreCase))
            .Where(j => from is null || j.LastChange >= from)
            .Where(j => to is null || j.LastChange <= to)];
    }
}
