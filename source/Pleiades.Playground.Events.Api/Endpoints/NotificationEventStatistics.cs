using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Events.Api.DataTransferObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Parsers;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>
/// Provides statistics endpoints for notification events.
/// </summary>
internal static class NotificationEventStatistics
{
    /// <summary>
    /// Maps notification event statistics endpoints.
    /// </summary>
    internal static RouteGroupBuilder MapNotificationEventStatistics(this RouteGroupBuilder group)
    {
        group.MapGet("/statistics/levelDistribution", GetLevelDistribution)
            .WithName("GetNotificationLevelDistribution")
            .WithSummary("Retrieves the distribution of notification events per level")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/statistics/timeBucketDistribution", GetTimeBucketDistribution)
            .WithName("GetNotificationTimeBucketDistribution")
            .WithSummary("Retrieves notification event distributions grouped by time buckets")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/statistics/messages", GetMessageStatistics)
            .WithName("GetNotificationMessageStatistics")
            .WithSummary("Retrieves statistics for notification messages (occurrence count, total duration, average duration)")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>
    /// Retrieves the distribution of notification events grouped by event level.
    /// </summary>
    /// <param name="mId">Optional machine identifier to filter events. Example: 0000-0000</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2024-12-12T08:35:23.629Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2024-12-12T09:35:23.629Z</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A list of level/count pairs.</returns>
    internal static async Task<Ok<List<LevelDistributionDtoV1>>> GetLevelDistribution(
        [FromQuery] string? mId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        var items = await repository.GetLevelDistributionAsync(mId, from, to, cancellationToken).ConfigureAwait(false);
        var dtos = EventsMapper.Map(items);
        return TypedResults.Ok(dtos);
    }

    /// <summary>
    /// Retrieves notification event counts grouped by time buckets.
    /// Each bucket contains the level distribution for that time interval.
    /// </summary>
    /// <param name="mId">Optional machine identifier to filter events. Example: 0000-0000</param>
    /// <param name="level">Optional event level filter. Example: Warning</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2024-12-12T08:35:23.629Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2024-12-12T09:35:23.629Z</param>
    /// <param name="bucketSize">Required bucket size (e.g. "15m", "1h", "1d").</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A list of time buckets with level distributions.</returns>
    internal static async Task<Results<Ok<List<TimeBucketDtoV1>>, BadRequest<string>>> GetTimeBucketDistribution(
        [FromQuery] string? mId,
        [FromQuery] EventLevel? level,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string bucketSize,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        if (!BucketSizeParser.TryParse(bucketSize, out var bucketTimeSpan))
        {
            return TypedResults.BadRequest(
                $"Invalid bucketSize '{bucketSize}'. Supported formats: {{number}}m (minutes), {{number}}h (hours), {{number}}d (days). Examples: 15m, 1h, 7d");
        }

        var items = await repository.GetTimeBucketsAsync(mId, level, from, to, bucketTimeSpan, cancellationToken).ConfigureAwait(false);
        var dtos = EventsMapper.Map(items);
        return TypedResults.Ok(dtos);
    }

    /// <summary>
    /// Retrieves statistics data for notification messages, including occurrence count and duration statistics.
    /// Groups notification events by NotificationId and computes how often each message was raised,
    /// the total duration across all paired Raised/Reset occurrences, and the average duration.
    /// </summary>
    /// <param name="mId">Optional machine identifier to filter events. Example: 0000-0000</param>
    /// <param name="level">Optional event level filter. Example: Warning</param>
    /// <param name="from">Optional start timestamp (inclusive). Example: 2024-12-12T08:35:23.629Z</param>
    /// <param name="to">Optional end timestamp (inclusive). Example: 2024-12-12T09:35:23.629Z</param>
    /// <param name="repository">Repository for notification event database access.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A list of statistics records per notification message.</returns>
    internal static async Task<Ok<List<NotificationMessageStatisticsDtoV1>>> GetMessageStatistics(
        [FromQuery] string? mId,
        [FromQuery] EventLevel? level,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        INotificationEventRepository repository,
        CancellationToken cancellationToken)
    {
        var items = await repository.GetMessageStatisticsAsync(mId, level, from, to, cancellationToken).ConfigureAwait(false);
        var dtos = EventsMapper.Map(items);
        return TypedResults.Ok(dtos);
    }
}
