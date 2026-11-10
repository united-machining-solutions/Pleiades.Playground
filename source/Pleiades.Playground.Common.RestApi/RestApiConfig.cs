using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Common.RestApi;

/// <summary>
/// REST API configuration
/// </summary>
public class RestApiConfig
{
    /// <summary>
    /// Base Uri of API
    /// </summary>
    [Required]
    public required Uri Uri { get; set; }

    /// <summary>
    /// Timeout
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Optional shared secret for trusted service-to-service calls. When set, it is sent
    /// in the <c>X-Internal-Api-Key</c> header on every request (see
    /// <see cref="HttpClientExtensions.ApplyInternalApiKey"/>), so a zero-trust backend
    /// authorizes the call without a user token. Leave empty for user-token flows.
    /// </summary>
    public string? ApiKey { get; set; }
}
