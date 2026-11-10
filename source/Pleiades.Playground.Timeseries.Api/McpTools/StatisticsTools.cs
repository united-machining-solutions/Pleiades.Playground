using System.ComponentModel;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Utils;

namespace Pleiades.Playground.Timeseries.Api.McpTools;

[McpServerToolType]
internal sealed class StatisticsTools(ITimeseriesDbService timeseriesDbService, IQueryParameterUtils queryParameterUtils)
{
    [McpServerTool(Name = "timeseries_statistics_query", ReadOnly = true),
     Description(
         "Compute statistics (min, max, mean, std, median, count) for a numeric topic over one or more time windows. " +
         "All supplied windows are combined (union); the result is one StatisticValue per matched topic, " +
         "aggregated across the union of the windows. " +
         "To compare distinct periods separately, call this once per period.")]
    public async Task<Dictionary<string, StatisticValueDtoV1>> QueryStatistics(
        [Description("Topic path for the numeric sensor (e.g. 'machines/9000-0001/sensors/spindleSpeed'). Supports wildcard '*'.")] string topic,
        [Description("Time windows whose union is analyzed. Each window has 'start' and 'stop' (ISO 8601). Example: [{'start':'2024-12-12T08:00:00Z','stop':'2024-12-12T09:00:00Z'}]")] List<TimeRangeDtoV1> timeWindows,
        [Description("Query timeout (e.g. '00:00:30' for 30 seconds). Default: 30s.")] TimeSpan? timeout = null,
        CancellationToken cancellationToken = default)
    {
        var (_, actualTimeout, _, _) = queryParameterUtils.ProcessQueryParameters(null, timeout, null);
        return await timeseriesDbService.GetStatisticValuesByTopicAndTimeRangesAsync(topic, timeWindows, actualTimeout, cancellationToken).ConfigureAwait(false);
    }
}
