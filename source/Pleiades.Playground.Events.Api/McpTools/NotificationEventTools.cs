using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataTransferObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Events.Api.Parsers;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.McpTools;

[McpServerToolType]
internal sealed class NotificationEventTools(INotificationEventRepository repository)
{
    [McpServerTool(Name = "events_notification_query", ReadOnly = true),
     Description(
         "Search notification events from industrial machines. " +
         "Notification events represent system alerts and messages with severity levels " +
         "(Silent, Information, Warning, Error). Each notification has an action " +
         "(Raised when the condition starts, Reset when it clears) and a correlationId " +
         "to link Raised/Reset pairs. Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<NotificationEventDtoV1>> QueryNotificationEvents(
        [Description("Machine ID (e.g. '9000-0001'). Omit to search all machines.")] string? mId = null,
        [Description("Notification action filter: Raised or Reset")] string? action = null,
        [Description("Notification message ID filter")] string? messageId = null,
        [Description("Severity level filter: Silent, Information, Warning or Error")] string? level = null,
        [Description("Start of time range (ISO 8601, e.g. '2024-12-12T08:00:00Z')")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601, e.g. '2024-12-12T09:00:00Z')")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by timestamp: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (items, totalCount) = await repository.QueryEventsWithPaginationAsync(
            mId, EventToolArguments.ParseEnum<NotificationAction>(action, nameof(action)), messageId, EventToolArguments.ParseEnum<EventLevel>(level, nameof(level)),
            fromDate, toDate, page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection),
            cancellationToken).ConfigureAwait(false);

        return new PagedResponse<NotificationEventDtoV1>(EventsMapper.Map(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_notification_pairs", ReadOnly = true),
     Description(
         "Retrieve paired notification events showing the full lifecycle of each notification " +
         "(from Raised to Reset). Each pair includes the raise timestamp, reset timestamp, " +
         "and the duration the notification was active. Notifications without a Reset event " +
         "are shown as still active (duration = null). " +
         "Useful for analyzing notification durations and identifying long-standing issues.")]
    public async Task<PagedResponse<PairedNotificationEventDtoV1>> QueryPairedNotifications(
        [Description("Machine ID (e.g. '9000-0001'). Omit to search all machines.")] string? mId = null,
        [Description("Notification message ID filter")] string? messageId = null,
        [Description("Severity level filter: Silent, Information, Warning or Error")] string? level = null,
        [Description("Start of time range (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by timestamp: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (items, totalCount) = await repository.QueryPairedEventsWithPaginationAsync(
            mId, messageId, EventToolArguments.ParseEnum<EventLevel>(level, nameof(level)),
            fromDate, toDate, page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection),
            cancellationToken).ConfigureAwait(false);

        return new PagedResponse<PairedNotificationEventDtoV1>(EventsMapper.Map(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_notification_level_distribution", ReadOnly = true),
     Description(
         "Get the distribution of notification events grouped by severity level " +
         "(Silent, Information, Warning, Error). Returns a count per level. " +
         "Useful for understanding the overall health of a machine or the system.")]
    public async Task<List<LevelDistributionDtoV1>> GetNotificationLevelDistribution(
        [Description("Machine ID (e.g. '9000-0001'). Omit for system-wide distribution.")] string? mId = null,
        [Description("Start of time range (ISO 8601)")] DateTime? from = null,
        [Description("End of time range (ISO 8601)")] DateTime? to = null,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.GetLevelDistributionAsync(mId, from, to, cancellationToken).ConfigureAwait(false);
        return EventsMapper.Map(items);
    }

    [McpServerTool(Name = "events_notification_time_buckets", ReadOnly = true),
     Description(
         "Get notification event counts grouped by time buckets, with per-level breakdown " +
         "in each bucket. Useful for spotting trends, identifying peak error periods, " +
         "and monitoring system health over time. " +
         "Bucket size format: '15m' (minutes), '1h' (hours), '1d' (days).")]
    public async Task<List<TimeBucketDtoV1>> GetNotificationTimeBuckets(
        [Description("Machine ID (e.g. '9000-0001'). Omit for system-wide distribution.")] string? mId = null,
        [Description("Severity level filter: Silent, Information, Warning or Error")] string? level = null,
        [Description("Start of time range (ISO 8601)")] DateTime? from = null,
        [Description("End of time range (ISO 8601)")] DateTime? to = null,
        [Description("Bucket size: '15m' (15 minutes), '1h' (1 hour), '1d' (1 day), '7d' (7 days)")] string bucketSize = "1h",
        CancellationToken cancellationToken = default)
    {
        if (!BucketSizeParser.TryParse(bucketSize, out var bucketTimeSpan))
        {
            throw new McpException(
                $"Invalid {nameof(bucketSize)} '{bucketSize}'. Supported formats: {{number}}m (minutes), {{number}}h (hours), {{number}}d (days). Examples: 15m, 1h, 7d");
        }

        var items = await repository.GetTimeBucketsAsync(
            mId, EventToolArguments.ParseEnum<EventLevel>(level, nameof(level)), from, to, bucketTimeSpan, cancellationToken).ConfigureAwait(false);
        return EventsMapper.Map(items);
    }

    [McpServerTool(Name = "events_notification_message_stats", ReadOnly = true),
     Description(
         "Get statistics for notification messages: how often each message was raised, " +
         "total duration across all occurrences, and average duration. " +
         "Sorted by occurrence count descending. " +
         "Useful for identifying the most frequent or longest-lasting notifications.")]
    public async Task<List<NotificationMessageStatisticsDtoV1>> GetNotificationMessageStatistics(
        [Description("Machine ID (e.g. '9000-0001'). Omit for system-wide statistics.")] string? mId = null,
        [Description("Severity level filter: Silent, Information, Warning or Error")] string? level = null,
        [Description("Start of time range (ISO 8601)")] DateTime? from = null,
        [Description("End of time range (ISO 8601)")] DateTime? to = null,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.GetMessageStatisticsAsync(
            mId, EventToolArguments.ParseEnum<EventLevel>(level, nameof(level)), from, to, cancellationToken).ConfigureAwait(false);
        return EventsMapper.Map(items);
    }
}
