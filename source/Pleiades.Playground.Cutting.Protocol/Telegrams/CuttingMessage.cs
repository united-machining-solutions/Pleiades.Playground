namespace Pleiades.Playground.Cutting.Protocol.Telegrams;

/// <summary>
/// One line in a telegram file: a request or reply (<see cref="CuttingTelegram"/>) or a notification
/// (<see cref="CuttingNotification"/>).
/// </summary>
public abstract record CuttingMessage
{
    /// <summary>
    /// The error code, characters 10 to 20. The protocol does not use it; it is <c>+0000000000</c>.
    /// </summary>
    public string ErrorCode { get; init; } = CuttingFormat.DefaultErrorCode;

    /// <summary>
    /// The fields, in order, without separators. Field 1 of the specification is index 0.
    /// </summary>
    public IReadOnlyList<string> Fields { get; init; } = [];

    /// <summary>
    /// The field with the 1-based number of the specification, or an empty string when the telegram is shorter.
    /// </summary>
    /// <param name="number">The 1-based field number.</param>
    /// <returns>The field value or an empty string.</returns>
    public string Field(int number)
    {
        return number >= 1 && number <= Fields.Count ? Fields[number - 1] : string.Empty;
    }

    /// <summary>
    /// The telegram as one line of a telegram file, without line break.
    /// </summary>
    /// <returns>The formatted telegram.</returns>
    public abstract string Format();
}
