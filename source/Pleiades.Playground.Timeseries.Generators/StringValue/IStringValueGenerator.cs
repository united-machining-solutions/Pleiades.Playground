using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators.StringValue;

public interface IStringValueGenerator
{
    event EventHandler<MessageGeneratedEventArgs<StringValueDto>>? MessageGenerated;

    public void StartGeneratingValues(CancellationToken stoppingToken);
}
