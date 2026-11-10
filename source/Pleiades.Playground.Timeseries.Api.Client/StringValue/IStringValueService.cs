using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.StringValue;

public interface IStringValueService
{
    Task<StringSeriesResponseDto> FindStringValuesByTopicAndTimeRange(string topic, DateTime startTime, DateTime stopTime, long limit, Sorting sorting, CancellationToken cancellationToken = default);

    Task<TimeseriesInsertResultDto> PostStringValues(Dictionary<string, StringSeriesRequestDto> stringValues, CancellationToken cancellationToken = default);
}
