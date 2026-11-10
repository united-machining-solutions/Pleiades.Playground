using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Utils;
using Pleiades.Playground.Timeseries.Common.Exceptions;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Endpoints;

/// <summary>
/// Provides endpoints for managing and querying timeseries data.
/// </summary>
internal static class Timeseries
{
    private static readonly Action<ILogger, Exception?> LogReadError = LoggerMessage.Define(LogLevel.Error, new EventId(1, nameof(LogReadError)), "Error during read operation");
    private static readonly Action<ILogger, Exception?> LogWriteError = LoggerMessage.Define(LogLevel.Error, new EventId(2, nameof(LogWriteError)), "Error during write operation");
    private static readonly Action<ILogger, Exception?> LogRateLimitExceeded = LoggerMessage.Define(LogLevel.Error, new EventId(3, nameof(LogRateLimitExceeded)), "Write operation rate limit exceeded: too many write attempts to the timeseries database");
    private static readonly Action<ILogger, Exception?> LogUnexpectedError = LoggerMessage.Define(LogLevel.Error, new EventId(4, nameof(LogUnexpectedError)), "An unexpected error occurred.");

    /// <summary>
    /// Maps the timeseries endpoints to the specified endpoint route builder.
    /// </summary>
    /// <param name="group">The endpoint route builder to which the endpoints will be mapped.</param>
    /// <returns>The updated endpoint route builder with the mapped endpoints.</returns>
    public static RouteGroupBuilder MapTimeseries(this RouteGroupBuilder group)
    {
        group.MapGet("/baseUnitValues/topics/{*topicPath}", GetBaseUnitValuesByTopic)
            .RequireFeatureRead(TimeseriesFeature.Name);
        group.MapPost("/baseUnitValues", CreateBaseUnitValues)
            .RequireFeatureWrite(TimeseriesFeature.Name);
        group.MapGet("/stringValues/topics/{*topicPath}", GetStringValuesByTopic)
            .RequireFeatureRead(TimeseriesFeature.Name);
        group.MapPost("/stringValues", CreateStringValues)
            .RequireFeatureWrite(TimeseriesFeature.Name);
        group.MapGet("/booleanValues/topics/{*topicPath}", GetBooleanValuesByTopic)
            .RequireFeatureRead(TimeseriesFeature.Name);
        group.MapPost("/booleanValues", CreateBooleanValues)
            .RequireFeatureWrite(TimeseriesFeature.Name);

        return group;
    }

    /// <summary>
    /// Retrieves base unit values for a given topic within the specified time range.
    /// </summary>
    /// <param name="topicPath">The topic path to query. Either it can be a fully qualified topic or containing * as wildcard(s).
    /// Example: "sensor/temperature" or "sensor/*"</param>
    /// <param name="startTime">The start time of the query (ISO 8601 format).
    /// Example: "2024-01-01T00:00:00.000000Z"</param>
    /// <param name="stopTime">The end time of the query (ISO 8601 format).
    /// Example: "2024-01-02T00:00:00.000000Z"</param>
    /// <param name="limit">Maximum number of points. In raw mode (downsample=false) it caps the whole query - shared across every topic a wildcard matches, not per topic. With downsample=true the query carries no limit at all and this is the target point count per series. Default value is set to 10'000'000</param>
    /// <param name="timeout">Limits the query time. Default value is set to 30s</param>
    /// <param name="sorting">Specifies the order in which the results are sorted. Can be or 0 for Ascending or 1 for Descending </param>
    /// <param name="downsample">When true, applies LTTB downsampling to reduce data to the specified limit while preserving visual shape. Default: false (raw data).</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="queryParameterUtils">Query parameter resolver/validator.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Ok<BaseUnitSeriesResponseDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> GetBaseUnitValuesByTopic(string topicPath, DateTime startTime, DateTime stopTime, long? limit, TimeSpan? timeout, Sorting? sorting, bool? downsample, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, IQueryParameterUtils queryParameterUtils, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        var normalizedTopic = Uri.UnescapeDataString(topicPath);

        try
        {
            var (actualLimit, actualTimeout, actualSorting, validationResult) = queryParameterUtils.ProcessQueryParameters(limit, timeout, sorting);

            if (validationResult != null)
            {
                return validationResult;
            }

            var records = await timeseriesDbService.GetBaseUnitValuesByTopicAndTimeRangeAsync(normalizedTopic, startTime, stopTime, actualLimit, actualTimeout, actualSorting, downsample ?? false, cancellationToken).ConfigureAwait(false);
            return TypedResults.Ok(SeriesResponseMapper.ToBaseUnitSeriesResponse(records));
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

    /// <summary>
    /// Creates new base unit values in the database.
    /// </summary>
    /// <param name="baseUnitValues">A dictionary of base unit values to be inserted.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Created<TimeseriesInsertResultDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> CreateBaseUnitValues(Dictionary<string, BaseUnitSeriesRequestDto> baseUnitValues, ILoggerFactory loggerFactory, ITimeseriesDbService timeseriesDbService, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        if (baseUnitValues == null || baseUnitValues.Values.Count == 0)
        {
            return TypedResults.BadRequest("The list of BaseUnitValueDaos is empty.");
        }

        try
        {
            var insertResult = await timeseriesDbService.AddAsync(baseUnitValues, cancellationToken).ConfigureAwait(false);

            if (insertResult.ValuesCount == 0)
            {
                return TypedResults.NotFound();
            }
            var resourceUri = new Uri("/baseUnitValues", UriKind.Relative);
            return TypedResults.Created(resourceUri, insertResult);
        }
        catch (PleiadesRateLimitException ex)
        {
            LogRateLimitExceeded(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status429TooManyRequests);
        }
        catch (PleiadesWriteException ex)
        {
            LogWriteError(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>
    /// Retrieves string values for a given topic within the specified time range.
    /// </summary>
    /// <param name="topicPath">The topic path to query. Either it can be a fully qualified topic or containing * as wildcard(s).
    /// Example: "sensor/temperature" or "sensor/*"</param>
    /// <param name="startTime">The start time of the query (ISO 8601 format).
    /// Example: "2024-01-01T00:00:00.000000Z"</param>
    /// <param name="stopTime">The end time of the query (ISO 8601 format).
    /// Example: "2024-01-02T00:00:00.000000Z"</param>
    /// <param name="limit">Maximum number of points. In raw mode (downsample=false) it caps the whole query - shared across every topic a wildcard matches, not per topic. With downsample=true the query carries no limit at all and this is the target point count per series. Default value is set to 10'000'000</param>
    /// <param name="timeout">Limits the query time. Default value is set to 30s</param>
    /// <param name="sorting">Specifies the order in which the results are sorted. Can be or 0 for Ascending or 1 for Descending </param>
    /// <param name="downsample">When true, applies downsampling to reduce data to the specified limit. Default: false (raw data).</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="queryParameterUtils">Query parameter resolver/validator.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Ok<StringSeriesResponseDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> GetStringValuesByTopic(string topicPath, DateTime startTime, DateTime stopTime, long? limit, TimeSpan? timeout, Sorting? sorting, bool? downsample, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, IQueryParameterUtils queryParameterUtils, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        var normalizedTopic = Uri.UnescapeDataString(topicPath);

        try
        {
            var (actualLimit, actualTimeout, actualSorting, validationResult) = queryParameterUtils.ProcessQueryParameters(limit, timeout, sorting);

            if (validationResult != null)
            {
                return validationResult;
            }

            var records = await timeseriesDbService.GetStringValuesByTopicAndTimeRangeAsync(normalizedTopic, startTime, stopTime, actualLimit, actualTimeout, actualSorting, downsample ?? false, cancellationToken).ConfigureAwait(false);
            return TypedResults.Ok(SeriesResponseMapper.ToStringSeriesResponse(records));
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

    /// <summary>
    /// Creates new string values in the database.
    /// </summary>
    /// <param name="stringValues">A dictionary of string values to be inserted.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Created<TimeseriesInsertResultDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> CreateStringValues(Dictionary<string, StringSeriesRequestDto> stringValues, ILoggerFactory loggerFactory, ITimeseriesDbService timeseriesDbService, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        if (stringValues == null || stringValues.Values.Count == 0)
        {
            return TypedResults.BadRequest("The list of StringValueDaos is empty.");
        }

        try
        {
            var insertResult = await timeseriesDbService.AddAsync(stringValues, cancellationToken).ConfigureAwait(false);

            if (insertResult.ValuesCount == 0)
            {
                return TypedResults.NotFound();
            }
            var resourceUri = new Uri("/stringValues", UriKind.Relative);
            return TypedResults.Created(resourceUri, insertResult);
        }
        catch (PleiadesRateLimitException ex)
        {
            LogRateLimitExceeded(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status429TooManyRequests);
        }
        catch (PleiadesWriteException ex)
        {
            LogWriteError(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>
    /// Retrieves boolean values for a given topic within the specified time range.
    /// </summary>
    /// <param name="topicPath">The topic path to query. Either it can be a fully qualified topic or containing * as wildcard(s).
    /// Example: "sensor/temperature" or "sensor/*"</param>
    /// <param name="startTime">The start time of the query (ISO 8601 format).
    /// Example: "2024-01-01T00:00:00.000000Z"</param>
    /// <param name="stopTime">The end time of the query (ISO 8601 format).
    /// Example: "2024-01-02T00:00:00.000000Z"</param>
    /// <param name="limit">Maximum number of points. In raw mode (downsample=false) it caps the whole query - shared across every topic a wildcard matches, not per topic. With downsample=true the query carries no limit at all and this is the target point count per series. Default value is set to 10'000'000</param>
    /// <param name="timeout">Limits the query time. Default value is set to 30s</param>
    /// <param name="sorting">Specifies the order in which the results are sorted. Can be or 0 for Ascending or 1 for Descending </param>
    /// <param name="downsample">When true, applies downsampling to reduce data to the specified limit. Default: false (raw data).</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="queryParameterUtils">Query parameter resolver/validator.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Ok<BooleanSeriesResponseDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> GetBooleanValuesByTopic(string topicPath, DateTime startTime, DateTime stopTime, long? limit, TimeSpan? timeout, Sorting? sorting, bool? downsample, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, IQueryParameterUtils queryParameterUtils, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        var normalizedTopic = Uri.UnescapeDataString(topicPath);

        try
        {
            var (actualLimit, actualTimeout, actualSorting, validationResult) = queryParameterUtils.ProcessQueryParameters(limit, timeout, sorting);

            if (validationResult != null)
            {
                return validationResult;
            }

            var records = await timeseriesDbService.GetBooleanValuesByTopicAndTimeRangeAsync(normalizedTopic, startTime, stopTime, actualLimit, actualTimeout, actualSorting, downsample ?? false, cancellationToken).ConfigureAwait(false);
            return TypedResults.Ok(SeriesResponseMapper.ToBooleanSeriesResponse(records));
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

    /// <summary>
    /// Creates new boolean values in the database.
    /// </summary>
    /// <param name="booleanValues">A dictionary of boolean values to be inserted.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="timeseriesDbService">Timeseries DB service dependency.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    internal static async Task<Results<Created<TimeseriesInsertResultDto>, BadRequest<string>, NotFound, StatusCodeHttpResult>> CreateBooleanValues(Dictionary<string, BooleanSeriesRequestDto> booleanValues, ILoggerFactory loggerFactory, ITimeseriesDbService timeseriesDbService, CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger(typeof(Timeseries));
        if (booleanValues == null || booleanValues.Values.Count == 0)
        {
            return TypedResults.BadRequest("The list of BooleanValueDaos is empty.");
        }

        try
        {
            var insertResult = await timeseriesDbService.AddAsync(booleanValues, cancellationToken).ConfigureAwait(false);

            if (insertResult.ValuesCount == 0)
            {
                return TypedResults.NotFound();
            }
            var resourceUri = new Uri("/booleanValues", UriKind.Relative);
            return TypedResults.Created(resourceUri, insertResult);
        }
        catch (PleiadesRateLimitException ex)
        {
            LogRateLimitExceeded(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status429TooManyRequests);
        }
        catch (PleiadesWriteException ex)
        {
            LogWriteError(logger, ex);
            return TypedResults.StatusCode(StatusCodes.Status400BadRequest);
        }
    }
}
