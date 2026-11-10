using System.Text.Json.Serialization;

namespace Pleiades.Playground.Common.Pagination;

/// <summary>
/// Specifies the sort order for paginated results.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Sorting
{
    /// <summary>
    /// Sort in ascending order (oldest/smallest first).
    /// </summary>
    Ascending,

    /// <summary>
    /// Sort in descending order (newest/largest first).
    /// </summary>
    Descending
}
