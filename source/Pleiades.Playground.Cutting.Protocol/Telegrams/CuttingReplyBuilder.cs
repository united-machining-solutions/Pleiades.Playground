namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// Builds the reply to a request that returns a table, such as <c>PRD_SHOW</c> or <c>PALSSHOW</c>.
/// </summary>
public static class CuttingReplyBuilder
{
    /// <summary>
    /// Puts the rows into as few telegrams as fit in <paramref name="maxLength"/> each. Every telegram but the
    /// last is an append reply (<c>A</c>), the last one is a last reply (<c>L</c>), as §3.5 describes for
    /// <c>PRD_SHOW</c>. A row is never split. No rows give one reply of 30 characters.
    /// </summary>
    /// <param name="request">The request.</param>
    /// <param name="rows">The rows; each has the same number of fields.</param>
    /// <param name="maxLength">The maximum length of one telegram.</param>
    /// <returns>The telegrams, in the order to send.</returns>
    public static IReadOnlyList<CuttingTelegram> Table(
        CuttingTelegram request,
        IReadOnlyList<IReadOnlyList<string>> rows,
        int maxLength = CuttingFormat.MaxTelegramLength)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(rows);

        if (rows.Count == 0)
        {
            return [CuttingTelegram.Reply(request)];
        }

        var columns = rows[0].Count;
        var telegrams = new List<CuttingTelegram>();
        var current = new List<IReadOnlyList<string>>();

        foreach (var row in rows)
        {
            if (current.Count > 0 && Telegram(request, columns, [.. current, row]).Format().Length > maxLength)
            {
                telegrams.Add(Telegram(request, columns, current) with { Kind = CuttingTelegramKind.Append });
                current = [];
            }

            current.Add(row);
        }

        telegrams.Add(Telegram(request, columns, current));
        return telegrams;
    }

    private static CuttingTelegram Telegram(CuttingTelegram request, int columns, List<IReadOnlyList<string>> rows)
    {
        return new CuttingTelegram
        {
            Command = request.Command,
            Kind = CuttingTelegramKind.Last,
            TransactionNumber = request.TransactionNumber,
            Columns = columns,
            Rows = rows.Count,
            Fields = rows.SelectMany(r => r).ToList(),
        };
    }
}
