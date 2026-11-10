using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>
/// Provides endpoints for managing notification events.
/// </summary>
internal static class NotificationEvents
{
    /// <summary>
    /// Maps notification event endpoints.
    /// </summary>
    internal static RouteGroupBuilder MapNotificationEvents(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetNotificationEvents)
            .WithName("GetNotificationEvents")
            .WithSummary("Retrieves notification events with pagination and optional filters")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/correlationPairs", GetPairedNotificationEvents)
            .WithName("GetPairedNotificationEvents")
            .WithSummary("Retrieves paired notification events (Raised/Reset pairs) with duration")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapPost("", PostNotificationEvent)
            .WithName("PostNotificationEvent")
            .WithSummary("Creates a new notification event")
            .RequireFeatureWrite(EventsFeature.Name);

        group.MapPost("/bulk", BulkPostNotificationEvents)
            .WithName("BulkPostNotificationEvents")
            .WithSummary("Creates multiple notification events in bulk")
            .RequireFeatureWrite(EventsFeature.Name);

        return group;
    }

    /// <summary>
    /// Retrieves notification events with pagination, optionally filtered by query parameters.
    /// </summary>
    /// <param name="mId">Optional machine identifier to filter events. Example: 0000-0000</param>
    /// <param name="action">Optional notification action type to filter events.</param>
    /// <param name="messageId">Optional message ID to filter events. Example: msg-123</param>
    /// <param name="level">Optional event level to filter events. Example: Warning</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2024-12-12T08:35:23.629Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2024-12-12T09:35:23.629Z</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting).</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of notification events.</returns>
    internal static async Task<Ok<PagedResponse<NotificationEventDtoV1>>> GetNotificationEvents(
        [FromQuery] string? mId,
        [FromQuery] NotificationAction? action,
        [FromQuery] string? messageId,
        [FromQuery] EventLevel? level,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            mId, action, messageId, level, from, to,
            validatedPaging.Skip, validatedPaging.Take, validatedPaging.Sorting,
            cancellationToken).ConfigureAwait(false);
        var dtos = EventsMapper.Map(items);
        return TypedResults.Ok(PagedResponse.Create(dtos, totalCount, validatedPaging));
    }

    /// <summary>
    /// Retrieves paired notification events (Raised/Reset pairs) with pagination and duration calculation.
    /// Groups events by correlationId and provides TimestampRaised, TimestampGone, and Duration.
    /// </summary>
    /// <param name="mId">Optional machine identifier to filter events.</param>
    /// <param name="messageId">Optional message ID to filter events.</param>
    /// <param name="level">Optional event level filter.</param>
    /// <param name="from">Optional start timestamp (inclusive).</param>
    /// <param name="to">Optional end timestamp (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting).</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A paginated list of paired notification events with duration information.</returns>
    internal static async Task<Ok<PagedResponse<PairedNotificationEventDtoV1>>> GetPairedNotificationEvents(
        [FromQuery] string? mId,
        [FromQuery] string? messageId,
        [FromQuery] EventLevel? level,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        var validatedPaging = paging.Validated();
        var (items, totalCount) = await repository.QueryPairedEventsWithPaginationAsync(
            mId, messageId, level, from, to,
            validatedPaging.Skip, validatedPaging.Take, validatedPaging.Sorting,
            cancellationToken).ConfigureAwait(false);
        var dtos = EventsMapper.Map(items);
        return TypedResults.Ok(PagedResponse.Create(dtos, totalCount, validatedPaging));
    }

    /// <summary>
    /// Creates a new notification event.
    /// </summary>
    /// <param name="dto">The notification event data transfer object.</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response with the created event or 409 on conflict.</returns>
    internal static async Task<Results<Created<NotificationEventDtoV1>, Conflict<string>>> PostNotificationEvent(
        NotificationEventDtoV1 dto,
        INotificationEventRepository repository,
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

        return TypedResults.Created(new Uri($"/{dao.Id}", UriKind.Relative), dto);
    }

    /// <summary>
    /// Creates multiple notification events in bulk.
    /// </summary>
    /// <param name="dtos">List of notification events to create.</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A 201 response on success or 409 on conflict.</returns>
    internal static async Task<Results<Created, Conflict<string>>> BulkPostNotificationEvents(
        List<NotificationEventDtoV1> dtos,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        var daos = EventsMapper.Map(dtos);

        try
        {
            await repository.CreateManyAsync(daos, cancellationToken).ConfigureAwait(false);
        }
        catch (PleiadesDuplicateDataException ex)
        {
            return TypedResults.Conflict($"Duplicate entries detected: {ex.Message}");
        }

        return TypedResults.Created(new Uri("/bulk", UriKind.Relative));
    }
}
