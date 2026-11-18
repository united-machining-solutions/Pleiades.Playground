using System.Text;

namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// A notification of the machine (specification §2.3), not acknowledged by the host:
/// <code>
/// 1..8   eight spaces
/// 9      N
/// 10..20 error code     +0000000000
/// 21..30 ten spaces
/// 31..   $$Name$$p1^p2^
/// </code>
/// </summary>
public sealed record CuttingNotification : CuttingMessage
{
    /// <summary>The name between the <c>$$</c>, for example <c>StartNCP</c>.</summary>
    public required string Name { get; init; }

    /// <summary>
    /// A notification with the given fields.
    /// </summary>
    /// <param name="name">The name, for example <see cref="Model.CuttingNotifications.StartNcp"/>.</param>
    /// <param name="fields">The fields.</param>
    /// <returns>The notification.</returns>
    public static CuttingNotification Create(string name, params IReadOnlyList<string> fields)
    {
        return new CuttingNotification { Name = name, Fields = fields };
    }

    /// <inheritdoc />
    public override string Format()
    {
        var builder = new StringBuilder(64);
        builder.Append(' ', 8);
        builder.Append((char)CuttingTelegramKind.Notification);
        builder.Append(CuttingFormat.Fixed(ErrorCode, 11));
        builder.Append(' ', 10);
        builder.Append("$$").Append(CuttingFormat.Sanitize(Name)).Append("$$");

        // The first field follows the name without a separator (§2.3).
        CuttingFormat.AppendFields(builder, Fields, leadingSeparator: false);
        return builder.ToString();
    }
}
