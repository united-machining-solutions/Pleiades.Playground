using System.Diagnostics.CodeAnalysis;
using System.Globalization;

namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// Reads one line of a telegram file.
/// </summary>
/// <remarks>
/// The reader is lenient, as §2.3 asks: it finds the <c>|</c> between the column and row counts instead of
/// trusting fixed offsets, because the examples of the specification and some machines differ by a few
/// characters, and it keeps fields beyond those it knows.
/// </remarks>
public static class CuttingTelegramParser
{
    /// <summary>
    /// Parses one line.
    /// </summary>
    /// <param name="line">The line, without line break.</param>
    /// <param name="message">The telegram or notification.</param>
    /// <param name="error">Why the line is not a telegram.</param>
    /// <returns>Whether the line is a telegram.</returns>
    public static bool TryParse(string? line, [NotNullWhen(true)] out CuttingMessage? message, out string? error)
    {
        message = null;
        error = null;
        line = line?.TrimEnd('\r', '\n');

        if (string.IsNullOrWhiteSpace(line) || line.Length < 9)
        {
            error = "The line is shorter than the header of a telegram.";
            return false;
        }

        return line[8] == (char)CuttingTelegramKind.Notification && line[..8].Trim().Length == 0
            ? TryParseNotification(line, out message, out error)
            : TryParseTelegram(line, out message, out error);
    }

    /// <summary>
    /// Parses one line or throws.
    /// </summary>
    /// <param name="line">The line.</param>
    /// <returns>The telegram or notification.</returns>
    /// <exception cref="FormatException">The line is not a telegram.</exception>
    public static CuttingMessage Parse(string line)
    {
        return TryParse(line, out var message, out var error) ? message : throw new FormatException(error);
    }

    private static bool TryParseNotification(string line, out CuttingMessage? message, out string? error)
    {
        message = null;
        error = null;
        var start = line.IndexOf("$$", 9, StringComparison.Ordinal);
        var end = start < 0 ? -1 : line.IndexOf("$$", start + 2, StringComparison.Ordinal);
        if (end < 0)
        {
            error = "The notification has no name between $$.";
            return false;
        }

        message = new CuttingNotification
        {
            Name = line[(start + 2)..end],
            ErrorCode = ErrorCode(line, start),
            Fields = CuttingFormat.SplitFields(line[(end + 2)..]),
        };
        return true;
    }

    private static bool TryParseTelegram(string line, out CuttingMessage? message, out string? error)
    {
        message = null;
        error = null;
        var kind = line[8];
        if (kind is not ((char)CuttingTelegramKind.Request or (char)CuttingTelegramKind.Append or (char)CuttingTelegramKind.Last))
        {
            error = string.Create(CultureInfo.InvariantCulture, $"Character 9 is '{kind}', not R, A, L or N.");
            return false;
        }

        var command = line[..8].Trim();
        var bar = line.IndexOf('|', 9);

        // A reply without fields ends after the transaction number.
        if (bar < 0)
        {
            message = new CuttingTelegram
            {
                Command = command,
                Kind = (CuttingTelegramKind)kind,
                ErrorCode = ErrorCode(line, Math.Min(line.Length, 20)),
                TransactionNumber = line.Length >= 30 ? line[20..30] : string.Empty,
            };
            return true;
        }

        if (bar < 9 + 1 + 10 + 4 || line.Length < bar + 5)
        {
            error = "The header is too short around '|'.";
            return false;
        }

        if (!int.TryParse(line.AsSpan(bar - 4, 4), NumberStyles.None, CultureInfo.InvariantCulture, out var columns) ||
            !int.TryParse(line.AsSpan(bar + 1, 4), NumberStyles.None, CultureInfo.InvariantCulture, out var rows))
        {
            error = "The column or row count is not a number.";
            return false;
        }

        var transactionEnd = bar - 4;
        message = new CuttingTelegram
        {
            Command = command,
            Kind = (CuttingTelegramKind)kind,
            ErrorCode = ErrorCode(line, transactionEnd - 10),
            TransactionNumber = line[(transactionEnd - 10)..transactionEnd],
            Columns = columns,
            Rows = rows,
            Fields = CuttingFormat.SplitFields(line[(bar + 5)..]),
        };
        return true;
    }

    private static string ErrorCode(string line, int end)
    {
        return end > 9 ? line[9..end].Trim() : CuttingFormat.DefaultErrorCode;
    }
}
