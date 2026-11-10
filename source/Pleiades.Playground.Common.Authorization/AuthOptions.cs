namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Backend JWT authorization options, bound from the host's <c>Config:Auth</c>
/// section. The same shape is reused by every Pleiades API once this library
/// is extracted to NuGet.
/// </summary>
public sealed class AuthOptions
{
    /// <summary>
    /// Master switch — on is on, off is off, in every environment. Defaults to
    /// <see langword="true"/> (fail-closed: auth is on unless explicitly turned off).
    /// Setting it to <see langword="false"/> runs the API unauthenticated — intended for
    /// local dev or an edge install with no identity provider.
    /// </summary>
    public bool Enabled { get; init; } = true;

    /// <summary>
    /// OIDC discovery document URL used to fetch signing keys (JWKS). Point this at
    /// the <em>internal</em> Keycloak address so keys are fetched in-cluster.
    /// </summary>
    public string? MetadataAddress { get; init; }

    /// <summary>
    /// Expected token issuer (<c>iss</c>) — the <em>external</em> Keycloak realm URL
    /// Keycloak stamps into tokens.
    /// </summary>
    public string? ValidIssuer { get; init; }

    /// <summary>
    /// Expected audience (<c>aud</c>) — this API's resource-client id, e.g.
    /// <c>uptime-api</c>.
    /// </summary>
    public string? Audience { get; init; }

    /// <summary>Allowed clock drift for token lifetime validation. Default 60 s.</summary>
    public TimeSpan ClockSkew { get; init; } = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Request header the gateway injects the access token into. Behind
    /// oauth2-proxy + Traefik ForwardAuth this is <c>X-Auth-Request-Access-Token</c>,
    /// because stock Traefik cannot rename it to <c>Authorization: Bearer</c>.
    /// Leave empty to read the standard <c>Authorization: Bearer</c> header. When
    /// set it is the single token source — identity headers are never trusted.
    /// </summary>
    public string? AccessTokenHeader { get; init; }

    /// <summary>
    /// Fallback only: an explicit JWKS URI, used when the OIDC discovery document
    /// advertises an unreachable (external) <c>jwks_uri</c>. Leave empty in normal
    /// setups and fix it at the infra layer (<c>KC_HOSTNAME_BACKCHANNEL_DYNAMIC</c>)
    /// instead — setting it hardcodes an infra URL into the service and undermines
    /// the library's lift-out portability.
    /// </summary>
    public Uri? JwksUriOverride { get; init; }

    /// <summary>
    /// Shared secret(s) for trusted service-to-service (East-West) callers that carry
    /// no user token. A request presenting a valid key in the
    /// <c>X-Internal-Api-Key</c> header (<see cref="InternalApiKeyDefaults"/>) satisfies
    /// every feature policy — read <em>and</em> write. Validated <em>locally</em>, with
    /// no Keycloak round-trip, so internal calls keep working during a Keycloak outage.
    /// Provide a list to rotate with zero downtime (accept the old and new key at once).
    /// Empty disables internal-key auth (only user JWTs are accepted).
    /// </summary>
    public IReadOnlyList<string> InternalApiKeys { get; init; } = [];
}
