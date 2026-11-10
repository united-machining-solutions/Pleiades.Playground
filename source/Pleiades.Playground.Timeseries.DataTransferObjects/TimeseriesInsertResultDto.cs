namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>Result of a timeseries insert operation.</summary>
public record TimeseriesInsertResultDto
{
    /// <summary>Total number of data points successfully written.</summary>
    public int ValuesCount { get; init; }
}
