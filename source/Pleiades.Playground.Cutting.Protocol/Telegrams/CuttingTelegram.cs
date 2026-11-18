using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// A request of the host or a reply of the machine (specification §2.3):
/// <code>
/// 1..8   command        SPLITPRG
/// 9      kind           R, A or L
/// 10..20 error code     +0000000000
/// 21..30 transaction    0000000001
/// 31..34 columns        0004
/// 35     '|'
/// 36..39 rows           0000 in a request
/// 40..   fields         ^234^h:\test^pt.lst^0^
/// </code>
/// A reply with several rows carries <see cref="Columns"/> fields per row, one row after the other.
/// </summary>
public sealed record CuttingTelegram : CuttingMessage
{
    /// <summary>The command, at most eight characters, for example <c>PRD_SHOW</c>.</summary>
    public required string Command { get; init; }

    /// <summary>Request, append reply or last reply.</summary>
    public required CuttingTelegramKind Kind { get; init; }

    /// <summary>The transaction number the host chose; the reply repeats it.</summary>
    public string TransactionNumber { get; init; } = "0000000001";

    /// <summary>The number of fields per row (characters 31 to 34).</summary>
    public int Columns { get; init; }

    /// <summary>The number of rows (characters 36 to 39); 0 in a request.</summary>
    public int Rows { get; init; }

    /// <summary>
    /// The fields split into rows of <see cref="Columns"/> fields. A request is one row.
    /// </summary>
    /// <returns>The rows.</returns>
    public IReadOnlyList<IReadOnlyList<string>> RowsOfFields()
    {
        if (Columns <= 0 || Fields.Count <= Columns)
        {
            return Fields.Count == 0 ? [] : [Fields];
        }

        return Fields.Chunk(Columns).Select(r => (IReadOnlyList<string>)r).ToList();
    }

    /// <summary>
    /// A request of the host.
    /// </summary>
    /// <param name="command">The command.</param>
    /// <param name="transactionNumber">The transaction number.</param>
    /// <param name="fields">The fields; field 1 is the machine number for most commands.</param>
    /// <returns>The request.</returns>
    public static CuttingTelegram Request(string command, long transactionNumber, params IReadOnlyList<string> fields)
    {
        ArgumentNullException.ThrowIfNull(fields);
        return new CuttingTelegram
        {
            Command = command,
            Kind = CuttingTelegramKind.Request,
            TransactionNumber = CuttingFormat.TransactionNumber(transactionNumber),
            Columns = fields.Count,
            Rows = 0,
            Fields = fields,
        };
    }

    /// <summary>
    /// A last reply with one row.
    /// </summary>
    /// <param name="request">The request this reply answers.</param>
    /// <param name="fields">The fields of the row.</param>
    /// <returns>The reply.</returns>
    public static CuttingTelegram Reply(CuttingTelegram request, params IReadOnlyList<string> fields)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(fields);
        return new CuttingTelegram
        {
            Command = request.Command,
            Kind = CuttingTelegramKind.Last,
            TransactionNumber = request.TransactionNumber,
            Columns = fields.Count,
            Rows = fields.Count == 0 ? 0 : 1,
            Fields = fields,
        };
    }

    /// <inheritdoc />
    public override string Format()
    {
        var builder = new StringBuilder(64);
        builder.Append(CuttingFormat.Fixed(Command, 8));
        builder.Append((char)Kind);
        builder.Append(CuttingFormat.Fixed(ErrorCode, 11));
        builder.Append(CuttingFormat.Fixed(TransactionNumber, 10));

        // A reply without fields ends after the transaction number (§2.3): 30 characters.
        if (Fields.Count == 0 && Kind != CuttingTelegramKind.Request)
        {
            return builder.ToString();
        }

        builder.Append(Math.Clamp(Columns, 0, 9999).ToString("D4", CultureInfo.InvariantCulture));
        builder.Append('|');
        builder.Append(Math.Clamp(Rows, 0, 9999).ToString("D4", CultureInfo.InvariantCulture));
        CuttingFormat.AppendFields(builder, Fields, leadingSeparator: true);
        return builder.ToString();
    }
}
