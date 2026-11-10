using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Repositories.NotificationEvent;

/// <summary>
/// Repository for notification event CRUD operations.
/// </summary>
internal interface INotificationEventRepository
{
    /// <summary>
    /// Creates a single notification event.
    /// </summary>
    Task CreateAsync(NotificationEventDao dao, CancellationToken cancellationToken);

    /// <summary>
    /// Creates several notification events (unordered bulk insert).
    /// </summary>
    Task CreateManyAsync(IEnumerable<NotificationEventDao> events, CancellationToken cancellationToken);

    Task<(List<NotificationEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        string? mId,
        NotificationAction? action,
        string? messageId,
        EventLevel? level,
        DateTime? fromDate,
        DateTime? toDate,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    Task<(List<PairedNotificationEventDao> Items, long TotalCount)> QueryPairedEventsWithPaginationAsync(
        string? mId,
        string? messageId,
        EventLevel? level,
        DateTime? fromDate,
        DateTime? toDate,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    Task<List<LevelDistributionDao>> GetLevelDistributionAsync(
        string? mId,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken);

    Task<List<TimeBucketDao>> GetTimeBucketsAsync(
        string? mId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        TimeSpan bucketSize,
        CancellationToken cancellationToken);

    Task<List<NotificationMessageStatisticsDao>> GetMessageStatisticsAsync(
        string? mId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken);
}
