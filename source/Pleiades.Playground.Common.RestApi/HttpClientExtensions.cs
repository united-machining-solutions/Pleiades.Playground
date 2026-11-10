namespace Pleiades.Playground.Common.RestApi;

/// <summary>
/// Helpers for wiring a typed <see cref="HttpClient"/> from a <see cref="RestApiConfig"/>.
/// </summary>
public static class HttpClientExtensions
{
    // Must match InternalApiKeyDefaults.HeaderName in the server-side
    // Pleiades.Playground.Common.Authorization package.
    private const string InternalApiKeyHeader = "X-Internal-Api-Key";

    /// <summary>
    /// Adds the internal API-key header (<c>X-Internal-Api-Key</c>) to
    /// <paramref name="client"/> when <see cref="RestApiConfig.ApiKey"/> is configured;
    /// no-op otherwise. Lets a service-to-service caller authenticate against a
    /// zero-trust backend without a user token.
    /// </summary>
    public static void ApplyInternalApiKey(this HttpClient client, RestApiConfig config)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(config);

        if (string.IsNullOrWhiteSpace(config.ApiKey))
        {
            return;
        }

        client.DefaultRequestHeaders.Remove(InternalApiKeyHeader);
        client.DefaultRequestHeaders.Add(InternalApiKeyHeader, config.ApiKey);
    }
}
