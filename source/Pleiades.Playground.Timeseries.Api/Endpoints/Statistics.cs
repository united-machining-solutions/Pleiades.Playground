using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Utils;
using Pleiades.Playground.Timeseries.Common.Exceptions;

namespace Pleiades.Playground.Timeseries.Api.Endpoints;

/// <summary>
/// Provides endpoints for getting statistics.
/// </summary>
internal static class Statistics
{
    private static readonly Action<ILogger, Exception?> LogReadError = LoggerMessage.Define(LogLevel.Error, new EventId(1, nameof(LogReadError)), "Error during read operation");
    private static readonly Action<ILogger, Exception?> LogUnexpectedError = LoggerMessage.Define(LogLevel.Error, new EventId(2, nameof(LogUnexpectedError)), "An unexpected error occurred.");

    /// <summary>
    /// Maps the statistic endpoints to the specified endpoint route builder.
    /// </summary>
    /// <param name="group">The endpoint route builder to which the endpoints will be mapped.</param>
    /// <returns>The updated endpoint route builder with the mapped endpoints.</returns>
    public static RouteGroupBuilder MapStatistics(this RouteGroupBuilder group)
    {
        group.MapPost("/baseUnitValues/topics/{topic}", GetStatisticValuesByTopicAndTimeRanges)
            .RequireFeatureRead(TimeseriesFeature.Name);
        return group;
    }

    /// <summary>
    /// Retrieves statistic values for a given topic, aggregated across all supplied time windows.
    /// </summary>
    /// <param name="topic">The topic to query. It can either be a fully qualified topic or contain '*' as a wildcard.
    /// Example: "sensor/temperature" or "sensor/*".</param>
    /// <param name="timeWindows">A list of time windows. All windows are combined; one aggregate is returned per matched topic.
    /// Example: [{ "start": "2024-01-01T00:00:00.000000Z", "stop": "2024-01-02T00:00:00.000000Z" }]</param>
    /// <param name="timeout">Limits the query time. Default value is set to 30s.</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="queryParameterUtils">Query parameter resolver/validator.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Ok<Dictionary<string, StatisticValueDtoV1>>, BadRequest<string>, NotFound, StatusCodeHttpResult>> GetStatisticValuesByTopicAndTimeRanges(string topic, [FromBody] List<TimeRangeDtoV1> timeWindows, TimeSpan? timeout, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, IQueryParameterUtils queryParameterUtils, CancellationToken cancellationToken)
    {
        if (timeWindows == null || timeWindows.Count == 0)
        {
            return TypedResults.BadRequest("At least one time window must be provided.");
        }

        var logger = loggerFactory.CreateLogger(typeof(Statistics));
        var normalizedTopic = Uri.UnescapeDataString(topic);

        var (_, actualTimeout, _, validationResult) = queryParameterUtils.ProcessQueryParameters(null, timeout, null);
        if (validationResult != null)
        {
            return validationResult;
        }

        try
        {
            var statisticValuesDto = await timeseriesDbService.GetStatisticValuesByTopicAndTimeRangesAsync(normalizedTopic, timeWindows, actualTimeout, cancellationToken).ConfigureAwait(false);
            return TypedResults.Ok(statisticValuesDto);
        }
        catch (PleiadesReadException ex)
        {
            LogReadError(logger, ex);
            return TypedResults.NotFound();
        }
        catch (TimeoutException ex)
        {
            LogReadError(logger, ex);
            return TypedResults.BadRequest(ex.Message);
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
