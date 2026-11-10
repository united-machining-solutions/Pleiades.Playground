using Pleiades.Playground.Common.DataTransferObjects;
namespace Pleiades.Playground.Timeseries.Api.Client.StatisticValue;

public interface IStatisticValueService
{
    Task<Dictionary<string, StatisticValueDtoV1>> GetStatisticValuesByTopicAndTimeRanges(string topic, List<TimeRangeDtoV1> timeWindows, CancellationToken cancellationToken = default);
}
