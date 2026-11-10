namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Represents a redaction rule for a specific JSON path.
/// Immutable record type for thread-safety.
/// </summary>
/// <param name="Path">The JSON path to redact (e.g., "loki.sinks[*].basicAuth.password")</param>
/// <param name="Redactor">The redactor to apply to values at this path</param>
public sealed record JsonPathRule(string Path, IStringRedactor Redactor)
{
    /// <summary>
    /// Gets the JSON path to redact.
    /// </summary>
    public string Path { get; } = Path ?? throw new ArgumentNullException(nameof(Path));

    /// <summary>
    /// Gets the redactor to apply.
    /// </summary>
    public IStringRedactor Redactor { get; } = Redactor ?? throw new ArgumentNullException(nameof(Redactor));
}
