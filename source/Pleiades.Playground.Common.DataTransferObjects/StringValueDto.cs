using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record class StringValueDto : IMessage
{
    public DateTime Timestamp { get; set; }
    public string Value { get; set; } = string.Empty;
}
