using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record class BaseUnitValuesDto : IMessage
{
    public DateTime Timestamp { get; set; }
    public DateTime[] Timestamps { get; set; } = Array.Empty<DateTime>();
    public double[] Values { get; set; } = Array.Empty<double>();
    public BaseUnit Unit { get; set; }
}
