using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// What makes two registrations one session: the same server, reached at the same address, with
/// the same security, the same certificate and the same user. Several machines behind one aggregation
/// server have the same key and share one session.
/// </summary>
/// <param name="Url">The address, normalized by <see cref="Normalize"/>.</param>
/// <param name="SecurityMode">The message security mode.</param>
/// <param name="SecurityPolicy">The short name of the security policy.</param>
/// <param name="Thumbprint">The thumbprint of the certificate the server is known by, upper case, or empty.</param>
/// <param name="User">The user the session logs in with, or empty for a session without a user.</param>
internal readonly record struct EndpointKey(string Url, SecurityMode SecurityMode, string SecurityPolicy, string Thumbprint, string User = "")
{
    /// <summary>The port of OPC UA (IANA), for an address that names none.</summary>
    public const int DefaultPort = 4840;

    /// <summary>The key of the endpoint of a registration.</summary>
    public static EndpointKey Of(EndpointRegistration endpoint)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        return new EndpointKey(
            Normalize(endpoint.Url),
            endpoint.SecurityMode,
            endpoint.SecurityPolicy,
            endpoint.ServerCertificateThumbprint?.ToUpperInvariant() ?? string.Empty,
            endpoint.User ?? string.Empty);
    }

    /// <summary>
    /// An address as one session knows it: the host in lower case, the port always written, no
    /// slash at the end. <c>opc.tcp://OpcGateway:11878/</c> and <c>opc.tcp://opcgateway:11878</c>
    /// are one server. An address that is no URL is returned as it is.
    /// </summary>
    public static string Normalize(string url)
    {
        if (!Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var parsed))
        {
            return url ?? string.Empty;
        }

        var port = parsed.IsDefaultPort || parsed.Port < 0 ? DefaultPort : parsed.Port;
        var path = parsed.AbsolutePath.TrimEnd('/');
        return $"{parsed.Scheme.ToLowerInvariant()}://{parsed.IdnHost.ToLowerInvariant()}:{port}{path}";
    }

    /// <summary>The address as the person wrote it, without the slash at the end.</summary>
    public static string Trim(string url) => (url ?? string.Empty).Trim().TrimEnd('/');
}
