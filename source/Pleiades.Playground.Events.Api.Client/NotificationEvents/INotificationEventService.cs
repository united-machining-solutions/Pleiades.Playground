using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.NotificationEvents;

/// <summary>
/// Defines interface of notification event service.
/// </summary>
public interface INotificationEventService
{
    /// <summary>
    /// Posts new event.
    /// </summary>
    Task<NotificationEventDtoV1> PostEvent(NotificationEventDtoV1 notificationEvent);

    /// <summary>
    /// Posts multiple events in bulk.
    /// </summary>
    Task PostEvents(IEnumerable<NotificationEventDtoV1> notificationEvents);

    /// <summary>
    /// Posts multiple events in bulk.
    /// </summary>
    Task PostEvents(IEnumerable<NotificationEventDtoV1> notificationEvents, CancellationToken cancellationToken);

    /// <summary>
    /// Get all events (paginated, returns first page with default settings).
    /// </summary>
    Task<PagedResponse<NotificationEventDtoV1>> FindAllEvents();

    /// <summary>
    /// Queries paired notification events (Raised/Reset correlation pairs) with filters and pagination.
    /// </summary>
    Task<PagedResponse<PairedNotificationEventDtoV1>> QueryPairedEventsAsync(
        string? mId,
        string? messageId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    /// <summary>
    /// Queries paired notification events with filters using default pagination (skip=0, take=1000, ascending).
    /// </summary>
    Task<PagedResponse<PairedNotificationEventDtoV1>> QueryPairedEventsAsync(
        string? mId,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken);
}
