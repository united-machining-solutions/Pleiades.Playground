using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Common.DataTransferObjects.Channels;

public record TimeDomainChannelBaseDtoV2 : ChannelBaseDtoV2
{
    public required List<DateTime> Timestamps { get; init; }
}

public record TimeDomainDoubleChannelDtoV2 : TimeDomainChannelBaseDtoV2
{
    public BaseUnit BaseUnit { get; init; }

    public required List<double> Values { get; init; }
}

public record TimeDomainBoolChannelDtoV2 : TimeDomainChannelBaseDtoV2
{
    public required List<bool> Values { get; init; }
}

public record TimeDomainStringChannelDtoV2 : TimeDomainChannelBaseDtoV2
{
    public required List<string> Values { get; init; }
}
