
namespace Pleiades.Playground.Common.DataTransferObjects;

public record class BaseUnitValue
{
    public double Value { get; set; }
    public BaseUnit Unit { get; set; }
}