using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record StatisticValueDtoV1
{
    public BaseUnit Unit { get; init; }

    public double Max { get; init; }

    public double Min { get; init; }

    public double Mean { get; init; }

    public double Median { get; init; }

    public double Std { get; init; }

    public double Delta { get; init; }

    public long Count { get; init; }
}
