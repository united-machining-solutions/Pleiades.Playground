namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>A single data point consisting of a timestamp and a typed value.</summary>
public record DataPointDto<T>
{
    /// <summary>The UTC timestamp of the measurement.</summary>
    public DateTime Timestamp { get; init; }
    /// <summary>The measured value.</summary>
    public T? Value { get; init; }
}
