using Microsoft.AspNetCore.Http;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Reads the bearer token from a gateway-injected request header. Behind
/// oauth2-proxy + Traefik ForwardAuth the access token arrives as
/// <c>X-Auth-Request-Access-Token</c> (stock Traefik cannot rename it to
/// <c>Authorization: Bearer</c>), so the API pulls it from there instead.
/// </summary>
internal static class GatewayToken
{
    /// <summary>
    /// Returns the trimmed token from <paramref name="headerName"/>, or
    /// <see langword="null"/> when the header is absent or empty.
    /// </summary>
    public static string? Extract(IHeaderDictionary headers, string headerName)
    {
        var value = headers[headerName].ToString();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
