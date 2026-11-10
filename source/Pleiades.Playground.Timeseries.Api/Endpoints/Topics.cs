using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Common.Exceptions;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Endpoints;

/// <summary>
/// Provides endpoints related to topic discovery.
/// </summary>
internal static class Topics
{
    internal const int MaxTimeoutSeconds = 300;
    internal static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);

    private static readonly Action<ILogger, Exception?> LogReadError = LoggerMessage.Define(LogLevel.Error, new EventId(1, nameof(LogReadError)), "Error during topics read operation");
    private static readonly Action<ILogger, Exception?> LogUnexpectedError = LoggerMessage.Define(LogLevel.Error, new EventId(2, nameof(LogUnexpectedError)), "An unexpected error occurred.");

    /// <summary>
    /// The limits of a topics query, in one place for <c>GET /topics</c> and <c>timeseries_topics_query</c>:
    /// REST maps an error to 400, the tool to a tool error, both with this text.
    /// </summary>
    /// <returns>The reason to refuse the request, or <see langword="null"/> and the timeout to run it with.</returns>
    internal static (string? Error, TimeSpan Timeout) Validate(DateTime startTime, DateTime stopTime, TimeSpan? timeout)
    {
        if (stopTime < startTime)
        {
            return ($"{nameof(stopTime)} must be greater than or equal to {nameof(startTime)}.", default);
        }

        var actualTimeout = timeout ?? DefaultTimeout;
        if (actualTimeout > TimeSpan.FromSeconds(MaxTimeoutSeconds))
        {
            return ($"{nameof(timeout)} must not exceed {MaxTimeoutSeconds} seconds.", default);
        }

        return (null, actualTimeout);
    }

    /// <summary>
    /// Maps topics endpoints.
    /// </summary>
    public static RouteGroupBuilder MapTopics(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetTopicsByTimeRange)
            .RequireFeatureRead(TimeseriesFeature.Name);
        return group;
    }

    /// <summary>
    /// Returns distinct topics for all supported measurement types (base unit, string, boolean) within the specified time range.
    /// </summary>
    /// <param name="startTime">The start time of the query (ISO 8601 format).
    /// Example: "2024-01-01T00:00:00.000000Z"</param>
    /// <param name="stopTime">The end time of the query (ISO 8601 format).
    /// Example: "2024-01-02T00:00:00.000000Z"</param>
    /// <param name="timeout">Optional timeout for the underlying database queries (defaults to 00:00:30 eg. 30s if not supplied).</param>
    /// <param name="timeseriesDbService">Timeseries DB service.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A TopicsDto containing three sorted distinct topic lists.</returns>
    internal static async Task<Results<Ok<TopicsDto>, BadRequest<string>, StatusCodeHttpResult>> GetTopicsByTimeRange(DateTime startTime, DateTime stopTime, TimeSpan? timeout, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, CancellationToken cancellationToken)
    {
        var (error, actualTimeout) = Validate(startTime, stopTime, timeout);
        if (error is not null)
        {
            return TypedResults.BadRequest(error);
        }

        var logger = loggerFactory.CreateLogger(typeof(Topics));

        try
        {
            var topics = await timeseriesDbService.GetTopicsByTimeRangeAsync(startTime, stopTime, actualTimeout, cancellationToken).ConfigureAwait(false);
            return TypedResults.Ok(topics);
        }
        catch (TimeoutException tex)
        {
            LogReadError(logger, tex);
            return TypedResults.BadRequest(tex.Message);
        }
        catch (PleiadesReadException ex)
        {
            LogReadError(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status500InternalServerError);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            LogUnexpectedError(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status500InternalServerError);
        }
    }
}
