namespace Pleiades.Playground.Common.DataTransferObjects;

/// <summary>
/// A closed time range defined by start and stop timestamps (UTC).
/// </summary>
public sealed record TimeRangeDtoV1
{
    /// <summary>Inclusive start of the time range (UTC).</summary>
    public required DateTimeOffset Start { get; init; }

    /// <summary>Exclusive end of the time range (UTC).</summary>
    public required DateTimeOffset Stop { get; init; }
}
