using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// Constants and helpers of the telegram format (specification §2.1 and §2.3).
/// </summary>
public static class CuttingFormat
{
    /// <summary>The maximum length of one telegram in bytes (§2.1).</summary>
    public const int MaxTelegramLength = 2467;

    /// <summary>The field separator.</summary>
    public const char Separator = '^';

    /// <summary>The unused error code of every telegram.</summary>
    public const string DefaultErrorCode = "+0000000000";

    /// <summary>The format of a timestamp: <c>TT.MM.JJJJ-hh:mm:ss</c>.</summary>
    public const string TimestampFormat = "dd.MM.yyyy-HH:mm:ss";

    /// <summary>
    /// A telegram file holds ASCII. Latin-1 keeps the bytes of a reader that writes umlauts, one byte per
    /// character, and needs no code page provider.
    /// </summary>
    public static Encoding Encoding { get; } = Encoding.Latin1;

    /// <summary>
    /// A timestamp in the format of the protocol.
    /// </summary>
    /// <param name="time">The time, in the local time of the machine.</param>
    /// <returns>The formatted timestamp.</returns>
    public static string Timestamp(DateTime time)
    {
        return time.ToString(TimestampFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Parses a timestamp in the format of the protocol.
    /// </summary>
    /// <param name="value">The text.</param>
    /// <param name="time">The parsed time.</param>
    /// <returns>Whether the text was a timestamp.</returns>
    public static bool TryParseTimestamp(string? value, out DateTime time)
    {
        return DateTime.TryParseExact(value, TimestampFormat, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out time);
    }

    /// <summary>
    /// A transaction number of ten digits.
    /// </summary>
    /// <param name="number">The number; only the last ten digits are kept.</param>
    /// <returns>The transaction number.</returns>
    public static string TransactionNumber(long number)
    {
        return (Math.Abs(number) % 10_000_000_000L).ToString("D10", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// An integer field.
    /// </summary>
    /// <param name="value">The value.</param>
    /// <returns>The field.</returns>
    public static string Whole(long value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// A decimal field with a point as decimal separator.
    /// </summary>
    /// <param name="value">The value.</param>
    /// <returns>The field.</returns>
    public static string Number(double value)
    {
        return value.ToString("0.###", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Removes what would break a telegram: separators, line breaks and characters outside Latin-1.
    /// </summary>
    /// <param name="value">The value.</param>
    /// <returns>The value that can stand in a field.</returns>
    public static string Sanitize(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var c in value)
        {
            builder.Append(c switch
            {
                Separator or '\r' or '\n' or '\t' => ' ',
                > 'ÿ' => '?',
                _ => c,
            });
        }

        return builder.ToString();
    }

    internal static string Fixed(string? value, int length)
    {
        var text = Sanitize(value);
        return text.Length >= length ? text[..length] : text.PadRight(length);
    }

    internal static void AppendFields(StringBuilder builder, IReadOnlyList<string> fields, bool leadingSeparator)
    {
        if (fields.Count == 0)
        {
            return;
        }

        if (leadingSeparator)
        {
            builder.Append(Separator);
        }

        foreach (var field in fields)
        {
            builder.Append(Sanitize(field)).Append(Separator);
        }
    }

    /// <summary>
    /// Splits the text after the header into fields: an optional leading <c>^</c>, then fields that each end
    /// with <c>^</c>. A last field without closing separator is kept.
    /// </summary>
    internal static IReadOnlyList<string> SplitFields(string text)
    {
        if (text.Length > 0 && text[0] == Separator)
        {
            text = text[1..];
        }

        if (text.Length == 0)
        {
            return [];
        }

        var fields = text.Split(Separator).ToList();
        if (fields[^1].Length == 0)
        {
            fields.RemoveAt(fields.Count - 1);
        }

        return fields;
    }
}
