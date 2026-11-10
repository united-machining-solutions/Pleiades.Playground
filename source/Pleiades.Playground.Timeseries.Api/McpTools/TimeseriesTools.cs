using System.ComponentModel;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Utils;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.McpTools;

[McpServerToolType]
internal sealed class TimeseriesTools(ITimeseriesDbService timeseriesDbService, IQueryParameterUtils queryParameterUtils)
{
    /// <summary>
    /// The <c>limit</c> description, written once and shared by all three query tools. Three copies of
    /// a sentence about behaviour are three places to drift apart again - which is precisely how the
    /// "per topic" claim this file used to make survived in seven places at once. <c>[Description]</c>
    /// takes a compile-time constant, so a <c>const</c> works here where a <c>static readonly</c>
    /// would not.
    /// </summary>
    private const string LimitDescription =
        "Max data points. In raw mode (downsample=false) this caps the WHOLE query - shared across " +
        "every topic a wildcard matches, not per topic - and because the sort is by timestamp across " +
        "the whole match, reaching it truncates every series at the same instant. With " +
        "downsample=true there is NO query cap: everything in the time range is read and this becomes " +
        "the target point count PER SERIES. Default: 10000000.";

    [McpServerTool(Name = "timeseries_baseunit_query", ReadOnly = true),
     Description(
         "Query numeric (base unit) time-series data from industrial machine sensors. " +
         "Returns timestamps and double values with a physical unit (Meter, Newton, Celsius, etc.). " +
         "Supports LTTB downsampling to reduce data points while preserving visual shape. " +
         "Use timeseries_topics_query first to discover available topics.")]
    public async Task<BaseUnitSeriesResponseDto> QueryBaseUnitValues(
        [Description("Topic path identifying the sensor (e.g. 'machines/9000-0001/sensors/spindleSpeed'). Supports wildcard '*'.")] string topic,
        [Description("Start of time range (ISO 8601, e.g. '2024-12-12T08:00:00Z')")] DateTime startTime,
        [Description("End of time range (ISO 8601, e.g. '2024-12-12T09:00:00Z')")] DateTime stopTime,
        [Description(LimitDescription)] long? limit = null,
        [Description("Query timeout (e.g. '00:00:30' for 30 seconds). Default: 30s.")] TimeSpan? timeout = null,
        [Description("Sort order: Ascending (chronological) or Descending. Default: Ascending.")] string sortDirection = "Ascending",
        [Description("Apply LTTB downsampling to reduce points to limit while preserving visual shape. Default: false.")] bool downsample = false,
        CancellationToken cancellationToken = default)
    {
        var (actualLimit, actualTimeout, sorting) = ResolveQueryParameters(limit, timeout, sortDirection);

        var result = await timeseriesDbService.GetBaseUnitValuesByTopicAndTimeRangeAsync(
            topic, startTime, stopTime, actualLimit, actualTimeout, sorting, downsample, cancellationToken).ConfigureAwait(false);

        return SeriesResponseMapper.ToBaseUnitSeriesResponse(result);
    }

    [McpServerTool(Name = "timeseries_string_query", ReadOnly = true),
     Description(
         "Query string time-series data from industrial machine sensors. " +
         "Returns timestamps and string values (status messages, machine states, identifiers). " +
         "Use timeseries_topics_query first to discover available string topics.")]
    public async Task<StringSeriesResponseDto> QueryStringValues(
        [Description("Topic path identifying the signal. Supports wildcard '*'.")] string topic,
        [Description("Start of time range (ISO 8601)")] DateTime startTime,
        [Description("End of time range (ISO 8601)")] DateTime stopTime,
        [Description(LimitDescription)] long? limit = null,
        [Description("Query timeout. Default: 30s.")] TimeSpan? timeout = null,
        [Description("Sort order: Ascending or Descending. Default: Ascending.")] string sortDirection = "Ascending",
        [Description("Apply every-Nth downsampling. Default: false.")] bool downsample = false,
        CancellationToken cancellationToken = default)
    {
        var (actualLimit, actualTimeout, sorting) = ResolveQueryParameters(limit, timeout, sortDirection);

        var result = await timeseriesDbService.GetStringValuesByTopicAndTimeRangeAsync(
            topic, startTime, stopTime, actualLimit, actualTimeout, sorting, downsample, cancellationToken).ConfigureAwait(false);

        return SeriesResponseMapper.ToStringSeriesResponse(result);
    }

    [McpServerTool(Name = "timeseries_boolean_query", ReadOnly = true),
     Description(
         "Query boolean time-series data from industrial machine sensors. " +
         "Returns timestamps and boolean values (on/off states, limit switches, digital signals). " +
         "Use timeseries_topics_query first to discover available boolean topics.")]
    public async Task<BooleanSeriesResponseDto> QueryBooleanValues(
        [Description("Topic path identifying the signal. Supports wildcard '*'.")] string topic,
        [Description("Start of time range (ISO 8601)")] DateTime startTime,
        [Description("End of time range (ISO 8601)")] DateTime stopTime,
        [Description(LimitDescription)] long? limit = null,
        [Description("Query timeout. Default: 30s.")] TimeSpan? timeout = null,
        [Description("Sort order: Ascending or Descending. Default: Ascending.")] string sortDirection = "Ascending",
        [Description("Apply every-Nth downsampling. Default: false.")] bool downsample = false,
        CancellationToken cancellationToken = default)
    {
        var (actualLimit, actualTimeout, sorting) = ResolveQueryParameters(limit, timeout, sortDirection);

        var result = await timeseriesDbService.GetBooleanValuesByTopicAndTimeRangeAsync(
            topic, startTime, stopTime, actualLimit, actualTimeout, sorting, downsample, cancellationToken).ConfigureAwait(false);

        return SeriesResponseMapper.ToBooleanSeriesResponse(result);
    }

    /// <summary>
    /// The three lines every tool repeated: parse the sort direction, then hand the trio to
    /// <see cref="IQueryParameterUtils.ProcessQueryParameters"/> for defaulting and clamping.
    /// </summary>
    /// <remarks>
    /// Extracted to shrink the duplicated token sequence across the three sibling tools, which
    /// SonarCloud reported as one 12-line block at each. Worth knowing why the <c>const</c> above did
    /// NOT shrink it: CPD normalises string literals before comparing, so the parameter lists match
    /// each other regardless of what the <c>[Description]</c> texts say - the third copy differs in
    /// every literal and was grouped with the other two anyway. Only the SHAPE can change the finding,
    /// which is what this does.
    /// The <c>BadRequest</c> element is discarded here exactly as it was in all three call sites: an
    /// MCP tool has no HTTP result to return it through, and the utility clamps rather than refuses.
    /// </remarks>
    private (long Limit, TimeSpan Timeout, Sorting Sorting) ResolveQueryParameters(
        long? limit, TimeSpan? timeout, string sortDirection)
    {
        var sorting = string.Equals(sortDirection, "Descending", StringComparison.OrdinalIgnoreCase)
            ? Sorting.Descending : Sorting.Ascending;
        var (actualLimit, actualTimeout, _, _) = queryParameterUtils.ProcessQueryParameters(limit, timeout, sorting);
        return (actualLimit, actualTimeout, sorting);
    }
}
