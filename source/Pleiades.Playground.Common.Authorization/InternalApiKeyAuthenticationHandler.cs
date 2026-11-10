using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Constants for the internal service-to-service (East-West) API-key authentication.
/// </summary>
public static class InternalApiKeyDefaults
{
    /// <summary>Authentication scheme name.</summary>
    public const string Scheme = "InternalApiKey";

    /// <summary>Header carrying the shared internal key on a service-to-service call.</summary>
    public const string HeaderName = "X-Internal-Api-Key";

    /// <summary>Claim type stamped on a request authenticated by a valid internal key.</summary>
    public const string ClaimType = "internal-service";
}

/// <summary>
/// Authenticates trusted East-West callers by a shared secret in the
/// <c>X-Internal-Api-Key</c> header, validated locally against
/// <see cref="AuthOptions.InternalApiKeys"/> — no Keycloak round-trip, so internal
/// calls survive a Keycloak outage. A match yields an identity carrying the
/// <see cref="InternalApiKeyDefaults.ClaimType"/> claim, which the feature policies
/// accept as an alternative to a user role. Absent header → no result (so a user JWT
/// on the same request still applies); present-but-wrong → failure.
/// </summary>
internal sealed class InternalApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AuthOptions authOptions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var provided = Request.Headers[InternalApiKeyDefaults.HeaderName].ToString();
        if (string.IsNullOrEmpty(provided))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!IsKnownKey(provided))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid internal API key."));
        }

        var identity = new ClaimsIdentity(
            [new Claim(InternalApiKeyDefaults.ClaimType, "true")],
            InternalApiKeyDefaults.Scheme);
        var ticket = new AuthenticationTicket(
            new ClaimsPrincipal(identity), InternalApiKeyDefaults.Scheme);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private bool IsKnownKey(string provided)
    {
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        var match = false;
        foreach (var key in authOptions.InternalApiKeys)
        {
            // OR-accumulate without short-circuit so the comparison time does not
            // reveal which (or whether a) configured key matched.
            match |= CryptographicOperations.FixedTimeEquals(
                providedBytes, Encoding.UTF8.GetBytes(key));
        }
        return match;
    }
}
