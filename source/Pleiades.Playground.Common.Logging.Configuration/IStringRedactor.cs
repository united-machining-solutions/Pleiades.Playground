namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Redacts a sensitive string value to a safe, loggable form.
/// </summary>
/// <remarks>
/// Implementations must be thread-safe and immutable.
/// </remarks>
public interface IStringRedactor
{
    /// <summary>
    /// Redacts the specified value.
    /// </summary>
    /// <param name="value">The sensitive value to redact. May be null.</param>
    /// <returns>The redacted value, or null if the value should be removed entirely.</returns>
    string? Redact(string? value);
}
