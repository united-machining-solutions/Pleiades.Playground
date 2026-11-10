using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Timeseries.Api;

/// <summary>
/// Strongly-typed settings for query limit defaults and upper bounds.
/// </summary>
internal sealed class QueryLimitsSettings
{
    /// <summary>
    /// Default maximum number of data points returned by a query when the caller omits a limit.
    /// </summary>
    [Range(1, long.MaxValue)]
    public long DefaultLimit { get; init; } = 10_000_000;

    /// <summary>
    /// Hard upper bound for the caller-supplied limit. Requests above this are rejected (HTTP) or
    /// clamped (MCP).
    /// </summary>
    [Range(1, long.MaxValue)]
    public long MaxLimit { get; init; } = 10_000_000;

    /// <summary>
    /// Default query timeout applied when the caller omits a timeout.
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:01", "365.00:00:00")]
    public TimeSpan DefaultTimeout { get; init; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Hard upper bound for the caller-supplied timeout. Requests above this are rejected (HTTP) or
    /// clamped (MCP).
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:01", "365.00:00:00")]
    public TimeSpan MaxTimeout { get; init; } = TimeSpan.FromSeconds(300);
}
