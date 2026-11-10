using Pleiades.Playground.Common.DataTransferObjects.DataTypes;

namespace Pleiades.Playground.Common.DataTransferObjects.Channels;

public record ChannelBaseDtoV2
{
    public string? Id { get; init; }

    public required string ChannelName { get; init; }

    public string Path { get; init; } = string.Empty;

    public ChannelType ChannelType { get; init; }

    public DateTime StartTime { get; init; }
}
