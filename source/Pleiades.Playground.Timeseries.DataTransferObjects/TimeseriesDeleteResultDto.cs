namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>Result of deleting the stored values of a machine.</summary>
public record TimeseriesDeleteResultDto
{
    /// <summary>Number of data points deleted, of base unit, string and boolean values together.</summary>
    public long ValuesCount { get; init; }
}
