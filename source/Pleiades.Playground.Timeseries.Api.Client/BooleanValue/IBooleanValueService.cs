using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.BooleanValue;

public interface IBooleanValueService
{
    Task<BooleanSeriesResponseDto> FindBooleanValuesByTopicAndTimeRange(string topic, DateTime startTime, DateTime stopTime, long limit, Sorting sorting, CancellationToken cancellationToken = default);

    Task<TimeseriesInsertResultDto> PostBooleanValues(Dictionary<string, BooleanSeriesRequestDto> booleanValues, CancellationToken cancellationToken = default);
}
