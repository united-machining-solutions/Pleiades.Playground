using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators.BaseUnitValue;

public interface IBaseUnitValueGenerator
{
    event EventHandler<MessageGeneratedEventArgs<BaseUnitValueDto>>? MessageGenerated;

    public void StartGeneratingValues(CancellationToken stoppingToken);
}
