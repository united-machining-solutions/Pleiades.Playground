using System.Globalization;
using System.Text.RegularExpressions;

// Compiled into the API and into the telemetry adapter (linked there), so both read a fault the same way.
namespace Pleiades.Playground.Ultimaker.Faults;

/// <summary>A fault the printer firmware wrote to its system log.</summary>
internal sealed record PrinterFault(DateTimeOffset RaisedAt, int Code, int Level, string Message);

/// <summary>
/// Finds fault lines in the answer of GET /api/v1/system/log. The manufacturer documents the route, not
/// the format of a line: this is the format of firmware 5.3.0, and a line that does not match is skipped.
/// </summary>
internal static partial class PrinterFaultLog
{
    internal const int MaximumMessageLength = 300;

    // "... PrinterService[898]: 2026-11-17 20:18:20,059 WARNING  faultHandler    Added Fault:
    //  <Fault: level=4 code=48 message='...' data='{}'>"
    [GeneratedRegex(@"(?<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),(?<ms>\d{3})\s+\w+\s+faultHandler\s+Added Fault: <Fault: level=(?<level>\d{1,9}) code=(?<code>\d{1,9}) message='(?<message>.*)' data='",
        RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex AddedFault();

    [GeneratedRegex(@"\b(?<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}\b", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex LineTime();

    /// <summary>The faults of the given log lines, oldest first, each one once.</summary>
    internal static IReadOnlyList<PrinterFault> Parse(IEnumerable<string?> lines)
    {
        var faults = new List<PrinterFault>();
        foreach (var line in lines)
        {
            if (line is null || !line.Contains("Added Fault", StringComparison.Ordinal)) continue;
            var match = AddedFault().Match(line);
            if (!match.Success || !TryTime(match.Groups["time"].Value, match.Groups["ms"].Value, out var raisedAt)) continue;
            var fault = new PrinterFault(raisedAt,
                int.Parse(match.Groups["code"].Value, CultureInfo.InvariantCulture),
                int.Parse(match.Groups["level"].Value, CultureInfo.InvariantCulture),
                Clean(match.Groups["message"].Value));
            if (!faults.Contains(fault)) faults.Add(fault);
        }
        faults.Sort((a, b) => a.RaisedAt.CompareTo(b.RaisedAt));
        return faults;
    }

    /// <summary>The time of the oldest line that carries one: how far back the given lines reach.</summary>
    internal static DateTimeOffset? Since(IEnumerable<string?> lines)
    {
        foreach (var line in lines)
        {
            if (line is null) continue;
            var match = LineTime().Match(line);
            if (match.Success && TryTime(match.Groups["time"].Value, "000", out var time)) return time;
        }
        return null;
    }

    // The printer keeps UTC; its job history reports the same clock.
    private static bool TryTime(string time, string milliseconds, out DateTimeOffset result)
        => DateTimeOffset.TryParseExact(time + "," + milliseconds, "yyyy-MM-dd HH:mm:ss,fff", CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out result);

    private static string Clean(string message)
    {
        var text = new string(message.Where(c => !char.IsControl(c)).ToArray()).Trim();
        return text.Length <= MaximumMessageLength ? text : text[..MaximumMessageLength];
    }
}
