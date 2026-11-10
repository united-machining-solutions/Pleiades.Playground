using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators.BooleanValue;

public interface IBooleanValueGenerator
{
    event EventHandler<MessageGeneratedEventArgs<BooleanValueDto>>? MessageGenerated;

    public void StartGeneratingValues(CancellationToken stoppingToken);
}
