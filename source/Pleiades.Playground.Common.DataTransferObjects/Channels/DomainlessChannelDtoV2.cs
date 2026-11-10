
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Common.DataTransferObjects.Channels;

public record DomainlessChannelDtoV2 : ChannelBaseDtoV2
{
    public BaseUnit BaseUnit { get; init; }

    public required List<double> Values { get; init; }
}
