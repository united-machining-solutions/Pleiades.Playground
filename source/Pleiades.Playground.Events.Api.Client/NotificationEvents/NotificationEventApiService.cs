using System.Globalization;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.NotificationEvents;

public class NotificationEventApiService(HttpClient httpClient)
    : BaseEventApiService(httpClient), INotificationEventService
{
    public Task<NotificationEventDtoV1> PostEvent(NotificationEventDtoV1 notificationEvent)
        => PostAsync<NotificationEventDtoV1>("notificationEvents", notificationEvent);

    public Task PostEvents(IEnumerable<NotificationEventDtoV1> notificationEvents)
        => PostAsync("notificationEvents/bulk", notificationEvents);

    public Task PostEvents(IEnumerable<NotificationEventDtoV1> notificationEvents, CancellationToken cancellationToken)
        => PostAsync("notificationEvents/bulk", notificationEvents, cancellationToken);

    public Task<PagedResponse<NotificationEventDtoV1>> FindAllEvents()
        => ExecuteGetRequestAsync<PagedResponse<NotificationEventDtoV1>>("notificationEvents");

    public Task<PagedResponse<PairedNotificationEventDtoV1>> QueryPairedEventsAsync(
        string? mId,
        string? messageId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        var queryParams = new Dictionary<string, string>
        {
            { "skip", skip.ToString(CultureInfo.InvariantCulture) },
            { "take", take.ToString(CultureInfo.InvariantCulture) },
            { "sorting", sorting.ToString() }
        };

        if (!string.IsNullOrWhiteSpace(mId))
        {
            queryParams.Add("mId", mId);
        }
        if (!string.IsNullOrWhiteSpace(messageId))
        {
            queryParams.Add("messageId", messageId);
        }
        if (level.HasValue)
        {
            queryParams.Add("level", level.Value.ToString());
        }
        if (from.HasValue)
        {
            queryParams.Add("from", Uri.EscapeDataString(from.Value.ToString("o", CultureInfo.InvariantCulture)));
        }
        if (to.HasValue)
        {
            queryParams.Add("to", Uri.EscapeDataString(to.Value.ToString("o", CultureInfo.InvariantCulture)));
        }

        var queryString = string.Join("&", queryParams.Select(kvp => $"{kvp.Key}={kvp.Value}"));
        var url = $"notificationEvents/correlationPairs?{queryString}";

        return ExecuteGetRequestAsync<PagedResponse<PairedNotificationEventDtoV1>>(url, cancellationToken);
    }

    public Task<PagedResponse<PairedNotificationEventDtoV1>> QueryPairedEventsAsync(
        string? mId,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken)
    {
        return QueryPairedEventsAsync(mId, null, null, from, to, 0, 1000, Sorting.Ascending, cancellationToken);
    }
}
