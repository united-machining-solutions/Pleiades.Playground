using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Fallback configuration manager: loads the OIDC discovery document from the
/// (internal) metadata address, then swaps its signing keys for a JWKS fetched
/// from an explicit, internally-reachable URI. Only used when
/// <see cref="AuthOptions.JwksUriOverride"/> is set — prefer the infra-level fix
/// (<c>KC_HOSTNAME_BACKCHANNEL_DYNAMIC</c>) so no infra URL leaks into the app.
/// </summary>
internal sealed class JwksOverrideConfigurationManager
    : IConfigurationManager<OpenIdConnectConfiguration>
{
    // Shared client — not owned/disposed by this type (HttpClient is meant to be reused).
    private static readonly HttpClient Http = new();

    private readonly ConfigurationManager<OpenIdConnectConfiguration> _inner;
    private readonly Uri _jwksUri;

    public JwksOverrideConfigurationManager(string metadataAddress, Uri jwksUri)
    {
        _inner = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataAddress,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = false });
        _jwksUri = jwksUri;
    }

    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel)
    {
        var config = await _inner.GetConfigurationAsync(cancel).ConfigureAwait(false);

        var rawJwks = await Http.GetStringAsync(_jwksUri, cancel).ConfigureAwait(false);
        var keys = new JsonWebKeySet(rawJwks);

        config.SigningKeys.Clear();
        foreach (var key in keys.GetSigningKeys())
        {
            config.SigningKeys.Add(key);
        }
        return config;
    }

    public void RequestRefresh() => _inner.RequestRefresh();
}
