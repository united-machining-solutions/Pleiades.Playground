// SPDX-License-Identifier: Apache-2.0
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>Endpoints of work master events, and of the program executions put together from them.</summary>
internal static class WorkMasterEvents
{
    /// <summary>Maps the endpoints of <c>/workMasterEvents</c>.</summary>
    internal static RouteGroupBuilder MapWorkMasterEvents(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetWorkMasterEvents)
            .WithName("GetWorkMasterEvents")
            .WithSummary("Retrieves work master events with pagination and optional filters")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/correlationPairs", GetProgramExecutionPairs)
            .WithName("GetProgramExecutionPairs")
            .WithSummary("Retrieves program executions, Started paired with Ended or Aborted, with duration and sums")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapPost("", PostWorkMasterEvent)
            .WithName("PostWorkMasterEvent")
            .WithSummary("Creates a new work master event")
            .RequireFeatureWrite(EventsFeature.Name);

        group.MapPost("/bulk", BulkPostWorkMasterEvents)
            .WithName("BulkPostWorkMasterEvents")
            .WithSummary("Creates multiple work master events in bulk")
            .RequireFeatureWrite(EventsFeature.Name);

        return group;
    }

    /// <summary>Retrieves work master events with pagination, optionally filtered.</summary>
    /// <param name="mId">Optional machine identifier. Example: P-04</param>
    /// <param name="action">Optional action, such as Started or Ended.</param>
    /// <param name="jobOrderId">Optional job order the program executions belong to. Example: 4711/01</param>
    /// <param name="workMasterId">Optional work master. Example: WM-SHAFT-4711</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2026-11-17T06:00:00Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2026-11-17T18:00:00Z</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting).</param>
    /// <param name="repository">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of work master events.</returns>
    internal static async Task<Ok<PagedResponse<WorkMasterEventDtoV1>>> GetWorkMasterEvents(
        [FromQuery] string? mId,
        [FromQuery] WorkMasterAction? action,
        [FromQuery] string? jobOrderId,
        [FromQuery] string? workMasterId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IWorkMasterEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            new WorkMasterEventFilter(mId, action, jobOrderId, workMasterId, from, to),
            validatedPaging.Skip, validatedPaging.Take, validatedPaging.Sorting,
            cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(PagedResponse.Create(EventsMapper.Map(items), totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves program executions: the work master events of each program execution paired by its execution id,
    /// Started with Ended or Aborted, with duration, parts and energy of its end. One that has not ended is still
    /// running.
    /// </summary>
    /// <param name="mId">Optional machine identifier.</param>
    /// <param name="jobOrderId">Optional job order the program executions belong to.</param>
    /// <param name="workMasterId">Optional work master.</param>
    /// <param name="from">Optional start timestamp of the events (inclusive).</param>
    /// <param name="to">Optional end timestamp of the events (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by start time).</param>
    /// <param name="repository">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of program executions.</returns>
    internal static async Task<Ok<PagedResponse<ProgramExecutionPairDtoV1>>> GetProgramExecutionPairs(
        [FromQuery] string? mId,
        [FromQuery] string? jobOrderId,
        [FromQuery] string? workMasterId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IWorkMasterEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var pairs = await ReadProgramExecutionsAsync(repository, mId, jobOrderId, workMasterId, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = JobOrderProjections.Page(pairs, p => p.StartTime, validatedPaging);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, validatedPaging));
    }

    /// <summary>Creates a new work master event.</summary>
    /// <param name="dto">The work master event.</param>
    /// <param name="repository">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response with the created event, or 409 when an event with its id exists.</returns>
    internal static async Task<Results<Created<WorkMasterEventDtoV1>, Conflict<string>>> PostWorkMasterEvent(
        WorkMasterEventDtoV1 dto,
        IWorkMasterEventRepository repository,
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

    /// <summary>Creates multiple work master events in bulk.</summary>
    /// <param name="dtos">The work master events.</param>
    /// <param name="repository">Repository of work master events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response on success, or 409 when some of them exist.</returns>
    internal static async Task<Results<Created, Conflict<string>>> BulkPostWorkMasterEvents(
        List<WorkMasterEventDtoV1> dtos,
        IWorkMasterEventRepository repository,
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
        IWorkMasterEventRepository repository, string? mId, string? jobOrderId, string? workMasterId,
        DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(
            new WorkMasterEventFilter(mId, null, jobOrderId, workMasterId, from, to), cancellationToken).ConfigureAwait(false);
        return JobOrderProjections.PairProgramExecutions(EventsMapper.Map(events));
    }
}
