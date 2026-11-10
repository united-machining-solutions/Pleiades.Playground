using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client;

public interface ITopicsService
{
    Task<TopicsDto> FindTopicsByTimeRange(DateTime startTime, DateTime stopTime, CancellationToken cancellationToken = default);
}
