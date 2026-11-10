using System.Text.RegularExpressions;

namespace Pleiades.Playground.Timeseries.Api.Services.MongoDb;

/// <summary>
/// Translates topic wildcards (<c>*</c> matches any sequence of characters) into a MongoDB filter
/// using either equality or a strictly anchored regular expression. The input topic is expected to be
/// already URL-decoded by the endpoint.
/// </summary>
internal static class TopicFilter
{
    /// <summary>
    /// Returns true when the given (already-decoded) topic contains the wildcard character.
    /// </summary>
    internal static bool HasWildcard(string topic) =>
        topic.Contains('*', StringComparison.Ordinal);

    /// <summary>
    /// Builds an anchored <see cref="Regex"/> pattern for a topic with wildcards. All regex
    /// metacharacters except <c>*</c> are escaped, and <c>*</c> is mapped to <c>.*</c>.
    /// </summary>
    internal static string ToAnchoredRegex(string topic)
    {
        var pattern = Regex.Escape(topic).Replace("\\*", ".*", StringComparison.Ordinal);
        return $"^{pattern}$";
    }
}
