using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>Time series data for string-valued measurements (write path).</summary>
public record StringSeriesRequestDto
{
    /// <summary>Ordered list of string data points.</summary>
    public IList<DataPointDto<string>> DataPoints { get; init; } = [];
    /// <summary>Total number of data points before downsampling.</summary>
    public int OriginalCount { get; set; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; set; }
}

/// <summary>Time series data for boolean-valued measurements (write path).</summary>
public record BooleanSeriesRequestDto
{
    /// <summary>Ordered list of boolean data points.</summary>
    public IList<DataPointDto<bool>> DataPoints { get; init; } = [];
    /// <summary>Total number of data points before downsampling.</summary>
    public int OriginalCount { get; set; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; set; }
}

/// <summary>Time series data for numeric measurements with a physical unit (write path).</summary>
public record BaseUnitSeriesRequestDto
{
    /// <summary>Physical unit of the measured values.</summary>
    public BaseUnit Unit { get; init; }
    /// <summary>Ordered list of numeric data points.</summary>
    public IList<DataPointDto<double>> DataPoints { get; init; } = [];
    /// <summary>Total number of data points before downsampling.</summary>
    public int OriginalCount { get; set; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; set; }
}
