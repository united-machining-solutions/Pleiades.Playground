using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Common.Pagination;

/// <summary>
/// Standard pagination request parameters for API endpoints.
/// </summary>
/// <param name="Skip">Number of items to skip. Must be >= 0. Default: 0.</param>
/// <param name="Take">Number of items to return. Must be between 1 and 1000. Default: 100.</param>
/// <param name="Sorting">Sort order for results. Default: Descending (newest first).</param>
public sealed record PagedRequest(
    [property: Range(0, int.MaxValue)] int Skip = 0,
    [property: Range(1, 1000)] int Take = 100,
    Sorting Sorting = Sorting.Descending)
{
    /// <summary>
    /// Maximum allowed value for Take parameter.
    /// </summary>
    public const int MaxTake = 1000;

    /// <summary>
    /// Default value for Take parameter.
    /// </summary>
    public const int DefaultTake = 100;

    /// <summary>
    /// Returns a validated instance with Skip and Take clamped to valid ranges.
    /// </summary>
    /// <returns>A new <see cref="PagedRequest"/> with validated values.</returns>
    public PagedRequest Validated() => this with
    {
        Skip = Math.Max(0, Skip),
        Take = Math.Clamp(Take, 1, MaxTake)
    };
}
