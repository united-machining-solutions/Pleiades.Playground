using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record class BaseUnitValueDto : IMessage
{
    public DateTime Timestamp { get; set; }
    public double Value { get; set; }
    public BaseUnit Unit { get; set; }
}
