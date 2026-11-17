using System.Security.Cryptography;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Client.Discovery;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>The server presents another certificate than the one the registration was made with.</summary>
internal sealed class ServerCertificateChangedException : Exception
{
    /// <summary>Creates the exception.</summary>
    public ServerCertificateChangedException()
    {
    }

    /// <summary>Creates the exception with a message.</summary>
    public ServerCertificateChangedException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and a cause.</summary>
    public ServerCertificateChangedException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>The endpoint a registration names is not offered by the server.</summary>
internal sealed class EndpointNotOfferedException : Exception
{
    /// <summary>Creates the exception.</summary>
    public EndpointNotOfferedException()
    {
    }

    /// <summary>Creates the exception with a message.</summary>
    public EndpointNotOfferedException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and a cause.</summary>
    public EndpointNotOfferedException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// What the adapter does with an OPC UA server before a session exists: ask for its endpoints and
/// open a session on the one a registration names.
/// </summary>
internal sealed class OpcUaClient : ISessionConnector
{
    private readonly IOpcUaDiscoveryService _discovery;
    private readonly IManagedSessionFactory _sessions;

    /// <summary>Creates the client on the services of the OPC UA stack.</summary>
    public OpcUaClient(IOpcUaDiscoveryService discovery, IManagedSessionFactory sessions)
    {
        _discovery = discovery ?? throw new ArgumentNullException(nameof(discovery));
        _sessions = sessions ?? throw new ArgumentNullException(nameof(sessions));
    }

    /// <summary>The endpoints the server at <paramref name="url"/> offers.</summary>
    public async Task<IReadOnlyList<OfferedEndpoint>> GetEndpointsAsync(string url, CancellationToken cancellationToken)
    {
        var offered = new List<OfferedEndpoint>();
        foreach (var description in await _discovery.GetEndpointsAsync(url, ct: cancellationToken).ConfigureAwait(false))
        {
            offered.Add(Offered(description));
        }

        return offered;
    }

    /// <summary>
    /// Opens a session on the endpoint with the security the registration names. The server must
    /// present the certificate the registration was made with, if it names one.
    /// </summary>
    public async Task<(ManagedSession Session, string? ServerCertificateThumbprint)> ConnectAsync(
        EndpointRegistration endpoint, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        EndpointDescription? selected = null;
        foreach (var description in await _discovery.GetEndpointsAsync(endpoint.Url, ct: cancellationToken).ConfigureAwait(false))
        {
            var offered = Offered(description);
            if (offered.SecurityMode == endpoint.SecurityMode
                && string.Equals(offered.SecurityPolicy, endpoint.SecurityPolicy, StringComparison.Ordinal)
                && description.EndpointUrl?.StartsWith("opc.tcp://", StringComparison.OrdinalIgnoreCase) == true)
            {
                selected = description;
                break;
            }
        }

        if (selected is null)
        {
            throw new EndpointNotOfferedException(
                $"The server at {endpoint.Url} offers no endpoint with {endpoint.SecurityMode} and {endpoint.SecurityPolicy}.");
        }

        var thumbprint = Thumbprint(selected);
        if (endpoint.ServerCertificateThumbprint is { Length: > 0 } pinned
            && !string.Equals(pinned, thumbprint, StringComparison.OrdinalIgnoreCase))
        {
            throw new ServerCertificateChangedException(
                $"The server at {endpoint.Url} presents the certificate {thumbprint}, the registration was made with {pinned}. " +
                "Register the machine again if the certificate was renewed on purpose.");
        }

        // A server in a container announces a host name of its own. The adapter keeps the host and
        // the port it reached, as OPC UA Part 4, 5.6.2.1 allows.
        if (Uri.TryCreate(endpoint.Url, UriKind.Absolute, out var reached)
            && Uri.TryCreate(selected.EndpointUrl, UriKind.Absolute, out var announced))
        {
            selected.EndpointUrl = new UriBuilder(announced) { Host = reached.IdnHost, Port = reached.Port }.ToString();
        }

        var session = await _sessions.ConnectAsync(new ConfiguredEndpoint(null, selected, null), cancellationToken).ConfigureAwait(false);
        return (session, thumbprint);
    }

    /// <inheritdoc />
    async Task<IEndpointSession> ISessionConnector.ConnectAsync(EndpointRegistration endpoint, CancellationToken cancellationToken)
    {
        var (session, _) = await ConnectAsync(endpoint, cancellationToken).ConfigureAwait(false);
        return new ManagedEndpointSession(session);
    }

    private static OfferedEndpoint Offered(EndpointDescription description)
    {
        var anonymous = false;
        foreach (var token in description.UserIdentityTokens)
        {
            anonymous |= token.TokenType == UserTokenType.Anonymous;
        }

        var mode = description.SecurityMode switch
        {
            MessageSecurityMode.SignAndEncrypt => SecurityMode.SignAndEncrypt,
            MessageSecurityMode.Sign => SecurityMode.Sign,
            _ => SecurityMode.None,
        };
        return new OfferedEndpoint(
            description.EndpointUrl ?? string.Empty,
            mode,
            EndpointRanking.ShortName(description.SecurityPolicyUri),
            anonymous,
            Thumbprint(description));
    }

    // A thumbprint identifies a certificate; it protects nothing here, so SHA-1 is what tools show.
#pragma warning disable CA5350 // Do Not Use Weak Cryptographic Algorithms
    private static string? Thumbprint(EndpointDescription description) =>
        description.ServerCertificate.IsEmpty ? null : Convert.ToHexString(SHA1.HashData(description.ServerCertificate.Span));
#pragma warning restore CA5350
}

/// <summary>A session of the OPC UA stack, as a machine on it sees it.</summary>
internal sealed class ManagedEndpointSession(ManagedSession session) : IEndpointSession
{
    /// <inheritdoc />
    public ISession Session => session;

    /// <inheritdoc />
    public bool IsAlive => session.Connected && !session.KeepAliveStopped;

    /// <inheritdoc />
    public async Task CloseAsync()
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await session.CloseAsync(timeout.Token).ConfigureAwait(false);
        }
#pragma warning disable CA1031 // Closing a session that is already gone may fail in any way, and none of them matters.
        catch (Exception)
#pragma warning restore CA1031
        {
            // The server forgets the session after its timeout.
        }
    }

    /// <inheritdoc />
    public ValueTask DisposeAsync() => session.DisposeAsync();
}
