using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>Response envelope containing one or more base unit time series.</summary>
public class BaseUnitSeriesResponseDto
{
    /// <summary>List of base unit series, one entry per distinct topic.</summary>
    public IList<BaseUnitSeriesDto> Series { get; init; } = [];
}

/// <summary>A single base unit time series for one topic.</summary>
public class BaseUnitSeriesDto
{
    /// <summary>The topic identifier.</summary>
    public string Topic { get; init; } = string.Empty;
    /// <summary>Physical unit of the values.</summary>
    public BaseUnit Unit { get; init; }
    /// <summary>Number of data points returned.</summary>
    public int Count { get; init; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; init; }
    /// <summary>Timestamps as Unix microseconds (UTC).</summary>
    public IList<long> Timestamps { get; init; } = [];
    /// <summary>Measured values corresponding to each timestamp.</summary>
    public IList<double> Values { get; init; } = [];
}

/// <summary>Response envelope containing one or more string time series.</summary>
public class StringSeriesResponseDto
{
    /// <summary>List of string series, one entry per distinct topic.</summary>
    public IList<StringSeriesDto> Series { get; init; } = [];
}

/// <summary>A single string time series for one topic.</summary>
public class StringSeriesDto
{
    /// <summary>The topic identifier.</summary>
    public string Topic { get; init; } = string.Empty;
    /// <summary>Number of data points returned.</summary>
    public int Count { get; init; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; init; }
    /// <summary>Timestamps as Unix microseconds (UTC).</summary>
    public IList<long> Timestamps { get; init; } = [];
    /// <summary>String values corresponding to each timestamp.</summary>
    public IList<string> Values { get; init; } = [];
}

/// <summary>Response envelope containing one or more boolean time series.</summary>
public class BooleanSeriesResponseDto
{
    /// <summary>List of boolean series, one entry per distinct topic.</summary>
    public IList<BooleanSeriesDto> Series { get; init; } = [];
}

/// <summary>A single boolean time series for one topic.</summary>
public class BooleanSeriesDto
{
    /// <summary>The topic identifier.</summary>
    public string Topic { get; init; } = string.Empty;
    /// <summary>Number of data points returned.</summary>
    public int Count { get; init; }
    /// <summary>Indicates whether the data was downsampled.</summary>
    public bool Downsampled { get; init; }
    /// <summary>Timestamps as Unix microseconds (UTC).</summary>
    public IList<long> Timestamps { get; init; } = [];
    /// <summary>Boolean values corresponding to each timestamp.</summary>
    public IList<bool> Values { get; init; } = [];
}
