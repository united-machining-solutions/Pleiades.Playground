using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Timeseries.Api.Endpoints;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.McpTools;

[McpServerToolType]
internal sealed class TopicsTools(ITimeseriesDbService timeseriesDbService)
{
    [McpServerTool(Name = "timeseries_topics_query", ReadOnly = true),
     Description(
         "Discover available topics (data sources) that have data points in a given time range. " +
         "Returns three lists: baseUnitTopics (numeric sensors), stringTopics (text signals), " +
         "and booleanTopics (on/off signals). " +
         "Use this first to understand which data is available before querying specific topics.")]
    public async Task<TopicsDto> QueryTopics(
        [Description("Start of time range (ISO 8601, e.g. '2024-12-12T08:00:00Z')")] DateTime startTime,
        [Description("End of time range (ISO 8601, e.g. '2024-12-12T09:00:00Z'); must not be before startTime.")] DateTime stopTime,
        [Description("Query timeout (e.g. '00:00:30' for 30 seconds). Default: 30s, maximum: 300s.")] TimeSpan? timeout = null,
        CancellationToken cancellationToken = default)
    {
        // The same check as GET /topics, in one place (Topics.Validate). An McpException reaches the caller as a
        // tool error with its message; any other exception would arrive as a generic one.
        var (error, actualTimeout) = Topics.Validate(startTime, stopTime, timeout);
        if (error is not null)
        {
            throw new McpException(error);
        }

        try
        {
            return await timeseriesDbService.GetTopicsByTimeRangeAsync(startTime, stopTime, actualTimeout, cancellationToken).ConfigureAwait(false);
        }
        catch (TimeoutException e)
        {
            // REST answers 400 with this message. Named, the agent can retry with a shorter range or a longer timeout.
            throw new McpException(e.Message, e);
        }
    }
}
