using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Common.DataTransferObjects.Channels;

public record EquidistantChannelDtoV2 : ChannelBaseDtoV2
{
    public BaseUnit BaseUnit { get; init; }

    public double Frequency { get; init; }

    public required List<double> Values { get; init; }
}
