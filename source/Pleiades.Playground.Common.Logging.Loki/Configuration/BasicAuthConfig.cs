namespace Pleiades.Playground.Common.Logging.Loki.Configuration;

/// <summary>
/// Basic authentication configuration for Loki
/// </summary>
public class BasicAuthConfig
{
    /// <summary>
    /// Username for basic authentication
    /// </summary>
    public required string Username { get; set; }

    /// <summary>
    /// Password for basic authentication
    /// </summary>
    public required string Password { get; set; }
}
