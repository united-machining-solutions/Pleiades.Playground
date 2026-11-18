using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Timeseries.DataTransferObjects;
using System.Diagnostics.CodeAnalysis;

namespace Pleiades.Playground.Timeseries.Api.Services;

/// <summary>
/// Defines interface of TimeseriesDb service
/// </summary>
[SuppressMessage("Design", "CA1515:Because an application's API isn't typically referenced from outside the assembly, types can be made internal",
    Justification = "Deliberately public. Making it internal is the mechanically correct answer to CA1515 and the wrong one here: " +
                    "Api.Client.Test mocks this interface, and Castle's proxy generator cannot see an internal type without adding " +
                    "InternalsVisibleTo(\"DynamicProxyGenAssembly2\") to this shipping assembly. That would break at RUN time rather " +
                    "than at compile time, and it widens a production assembly's visibility to satisfy an analyzer. Decided 2026-09-08.")]
public interface ITimeseriesDbService : IDisposable
{
    /// <summary>
    /// Adds list of base unit value
    /// </summary>
    Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, BaseUnitSeriesRequestDto> values, CancellationToken cancellationToken = default);

    /// <summary>
    /// Adds list of string value
    /// </summary>
    Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, StringSeriesRequestDto> values, CancellationToken cancellationToken = default);

    /// <summary>
    /// Adds list of boolean value
    /// </summary>
    Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, BooleanSeriesRequestDto> values, CancellationToken cancellationToken = default);

    /// <summary>
    /// Query BaseUnitValues topic, startTime and stopTime
    /// </summary>
    /// <param name="topic">Topic filter (supports wildcard '*').</param>
    /// <param name="startTime">Inclusive query start timestamp.</param>
    /// <param name="stopTime">Inclusive query stop timestamp.</param>
    /// <param name="limit">Maximum number of points in raw mode, SHARED across every topic the
    /// filter matches - NOT per topic. One <c>Limit</c> goes on one query over the topic regex,
    /// sorted by timestamp; the per-topic series are bucketed out of whatever that returned.
    /// When <paramref name="downsample"/> is true the opposite holds: the query carries NO limit at
    /// all, every document in the range is read, and this value is the target point count PER SERIES
    /// that the downsampler aims at.</param>
    /// <param name="timeout">Maximum query execution time.</param>
    /// <param name="sorting">Result ordering (ascending or descending by time).</param>
    /// <param name="downsample">When true, applies LTTB downsampling to reduce data points to the specified limit while preserving visual shape.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<Dictionary<string, BaseUnitSeriesRequestDto>> GetBaseUnitValuesByTopicAndTimeRangeAsync(string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting, bool downsample, CancellationToken cancellationToken = default);

    /// <summary>
    /// Query StringValues by topic, startTime and stopTime
    /// </summary>
    /// <param name="topic">Topic filter (supports wildcard '*').</param>
    /// <param name="startTime">Inclusive query start timestamp.</param>
    /// <param name="stopTime">Inclusive query stop timestamp.</param>
    /// <param name="limit">Maximum number of points in raw mode, SHARED across every topic the
    /// filter matches - NOT per topic. One <c>Limit</c> goes on one query over the topic regex,
    /// sorted by timestamp; the per-topic series are bucketed out of whatever that returned.
    /// When <paramref name="downsample"/> is true the opposite holds: the query carries NO limit at
    /// all, every document in the range is read, and this value is the target point count PER SERIES
    /// that the downsampler aims at.</param>
    /// <param name="timeout">Maximum query execution time.</param>
    /// <param name="sorting">Result ordering (ascending or descending by time).</param>
    /// <param name="downsample">When true, applies every-Nth downsampling to reduce data points to the specified limit.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<Dictionary<string, StringSeriesRequestDto>> GetStringValuesByTopicAndTimeRangeAsync(string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting, bool downsample, CancellationToken cancellationToken = default);

    /// <summary>
    /// Query BooleanValues by topic, startTime and stopTime
    /// </summary>
    /// <param name="topic">Topic filter (supports wildcard '*').</param>
    /// <param name="startTime">Inclusive query start timestamp.</param>
    /// <param name="stopTime">Inclusive query stop timestamp.</param>
    /// <param name="limit">Maximum number of points in raw mode, SHARED across every topic the
    /// filter matches - NOT per topic. One <c>Limit</c> goes on one query over the topic regex,
    /// sorted by timestamp; the per-topic series are bucketed out of whatever that returned.
    /// When <paramref name="downsample"/> is true the opposite holds: the query carries NO limit at
    /// all, every document in the range is read, and this value is the target point count PER SERIES
    /// that the downsampler aims at.</param>
    /// <param name="timeout">Maximum query execution time.</param>
    /// <param name="sorting">Result ordering (ascending or descending by time).</param>
    /// <param name="downsample">When true, applies every-Nth downsampling to reduce data points to the specified limit.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<Dictionary<string, BooleanSeriesRequestDto>> GetBooleanValuesByTopicAndTimeRangeAsync(string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting, bool downsample, CancellationToken cancellationToken = default);

    /// <summary>
    /// Query StatisticValues by topic and time windows
    /// </summary>
    /// <param name="topic">Topic filter (supports wildcard '*').</param>
    /// <param name="timeWindows">Time windows whose union is aggregated.</param>
    /// <param name="timeout">Maximum query execution time.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<Dictionary<string, StatisticValueDtoV1>> GetStatisticValuesByTopicAndTimeRangesAsync(string topic, List<TimeRangeDtoV1> timeWindows, TimeSpan timeout, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns distinct topics (base unit, string and boolean) that have data points in the given time window.
    /// </summary>
    /// <param name="startTime">Start of time window (inclusive)</param>
    /// <param name="stopTime">End of time window (exclusive)</param>
    /// <param name="timeout">Maximum time to wait for all queries</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<TopicsDto> GetTopicsByTimeRangeAsync(DateTime startTime, DateTime stopTime, TimeSpan timeout, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if the timeseries database server is reachable.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>True if the server is reachable, false otherwise</returns>
    Task<bool> PingAsync(CancellationToken cancellationToken = default);
}
