using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record class BooleanValueDto : IMessage
{
    public DateTime Timestamp { get; set; }
    public bool Value { get; set; }
}
