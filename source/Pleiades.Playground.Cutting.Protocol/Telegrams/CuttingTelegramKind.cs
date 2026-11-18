namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// Character 9 of a telegram: what the telegram is.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Design", "CA1008:Enums should have zero value",
    Justification = "The values are the characters of the protocol; there is no 'none'.")]
public enum CuttingTelegramKind
{
    /// <summary>A request from the host to the machine (<c>R</c>).</summary>
    Request = 'R',

    /// <summary>A reply of the machine; more replies of the same transaction follow (<c>A</c>).</summary>
    Append = 'A',

    /// <summary>The last reply of the machine; the transaction is complete (<c>L</c>).</summary>
    Last = 'L',

    /// <summary>A notification of the machine that the host does not acknowledge (<c>N</c>).</summary>
    Notification = 'N',
}
