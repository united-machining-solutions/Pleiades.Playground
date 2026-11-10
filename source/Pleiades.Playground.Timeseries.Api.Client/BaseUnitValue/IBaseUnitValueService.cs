using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;

public interface IBaseUnitValueService
{
    Task<BaseUnitSeriesResponseDto> FindBaseUnitValuesByTopicAndTimeRange(string topic, DateTime startTime, DateTime stopTime, long limit, Sorting sorting, CancellationToken cancellationToken = default);

    Task<TimeseriesInsertResultDto> PostBaseUnitValues(Dictionary<string, BaseUnitSeriesRequestDto> baseUnitValues, CancellationToken cancellationToken = default);
}
