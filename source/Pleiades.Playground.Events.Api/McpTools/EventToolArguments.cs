using ModelContextProtocol;
using Pleiades.Playground.Common.Pagination;

namespace Pleiades.Playground.Events.Api.McpTools;

/// <summary>
/// Argument handling shared by the Events MCP tools.
/// </summary>
/// <remarks>
/// Parsing a filter with <c>Enum.TryParse(...) ? value : null</c> would silently drop an invalid value,
/// and the tool would answer with unfiltered data where REST answers 400. An invalid value is therefore
/// an <see cref="McpException"/> naming the allowed values; only that exception type reaches the caller
/// as a tool error with its message.
/// </remarks>
internal static class EventToolArguments
{
    /// <summary>Largest page an MCP tool returns.</summary>
    public const int MaxTake = 100;

    /// <summary>
    /// Parses an optional enum filter. <see langword="null"/> or blank means "no filter"; anything else must
    /// be exactly one value's name (case-insensitive), otherwise the call is refused.
    /// </summary>
    public static T? ParseEnum<T>(string? value, string parameterName) where T : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        // A name match, not Enum.TryParse: that also accepts numbers ("99") and ORs a comma list bitwise,
        // so "Warning,Error" would silently filter on Error.
        var name = Enum.GetNames<T>().FirstOrDefault(n => n.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));
        if (name is not null)
        {
            return Enum.Parse<T>(name);
        }

        throw new McpException($"Invalid {parameterName} '{value}'. Allowed values: {string.Join(", ", Enum.GetNames<T>())}.");
    }

    /// <summary>Parses the sort direction; blank means the default, descending.</summary>
    public static Sorting ParseSorting(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "Descending", StringComparison.OrdinalIgnoreCase))
        {
            return Sorting.Descending;
        }

        if (string.Equals(value, "Ascending", StringComparison.OrdinalIgnoreCase))
        {
            return Sorting.Ascending;
        }

        throw new McpException($"Invalid sortDirection '{value}'. Allowed values: Ascending, Descending.");
    }

    /// <summary>
    /// The page that is actually queried: skip at least 0, take between 1 and <see cref="MaxTake"/>. The
    /// response echoes these values, so a caller can tell when it asked for more than it got.
    /// </summary>
    public static (int Skip, int Take) Page(int skip, int take) => (Math.Max(0, skip), Math.Clamp(take, 1, MaxTake));
}
