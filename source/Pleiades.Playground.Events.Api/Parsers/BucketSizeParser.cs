using System.Globalization;
using System.Text.RegularExpressions;

namespace Pleiades.Playground.Events.Api.Parsers;

/// <summary>
/// Provides parsing utilities for bucket size strings (e.g. "15m", "1h", "1d").
/// </summary>
internal static partial class BucketSizeParser
{
    /// <summary>
    /// Parses a bucket size string into a <see cref="TimeSpan"/>.
    /// Supported formats: {number}m (minutes), {number}h (hours), {number}d (days).
    /// </summary>
    /// <param name="bucketSize">The bucket size string to parse (e.g. "15m", "1h", "7d").</param>
    /// <param name="result">The parsed <see cref="TimeSpan"/> if successful.</param>
    /// <returns><c>true</c> if parsing was successful; otherwise <c>false</c>.</returns>
    public static bool TryParse(string? bucketSize, out TimeSpan result)
    {
        result = TimeSpan.Zero;

        if (string.IsNullOrWhiteSpace(bucketSize))
        {
            return false;
        }

        var match = BucketSizeRegex().Match(bucketSize.Trim());
        if (!match.Success)
        {
            return false;
        }

        var value = int.Parse(match.Groups["value"].Value, CultureInfo.InvariantCulture);
        if (value <= 0)
        {
            return false;
        }

        var unit = match.Groups["unit"].Value.ToLowerInvariant();

        result = unit switch
        {
            "m" => TimeSpan.FromMinutes(value),
            "h" => TimeSpan.FromHours(value),
            "d" => TimeSpan.FromDays(value),
            _ => TimeSpan.Zero
        };

        return result > TimeSpan.Zero;
    }

    [GeneratedRegex(@"^(?<value>\d+)(?<unit>[mhd])$", RegexOptions.IgnoreCase)]
    private static partial Regex BucketSizeRegex();
}
