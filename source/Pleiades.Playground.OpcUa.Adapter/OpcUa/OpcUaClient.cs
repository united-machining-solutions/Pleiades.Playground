using System.Security.Cryptography;
using System.Text;
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

/// <summary>A session with a user is wanted, and no password is stored for that user and server.</summary>
internal sealed class CredentialMissingException : InvalidOperationException
{
    /// <summary>Creates the exception.</summary>
    public CredentialMissingException()
    {
    }

    /// <summary>Creates the exception with a message.</summary>
    public CredentialMissingException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and a cause.</summary>
    public CredentialMissingException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// What the adapter does with an OPC UA server before a session exists: ask for its endpoints and
/// open a session on the one a registration names, without a user or with the user it names.
/// </summary>
internal sealed class OpcUaClient : ISessionConnector
{
    private readonly IOpcUaDiscoveryService _discovery;
    private readonly IManagedSessionFactory _sessions;
    private readonly CredentialStore _credentials;

    /// <summary>Creates the client on the services of the OPC UA stack.</summary>
    /// <summary>How long a connect may take before it fails.</summary>
    public static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(30);

    public OpcUaClient(IOpcUaDiscoveryService discovery, IManagedSessionFactory sessions, CredentialStore credentials)
    {
        _discovery = discovery ?? throw new ArgumentNullException(nameof(discovery));
        _sessions = sessions ?? throw new ArgumentNullException(nameof(sessions));
        _credentials = credentials ?? throw new ArgumentNullException(nameof(credentials));
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
    /// Opens a session on the endpoint with the security the registration names, and with its user
    /// if it names one: the password comes from the credential store, and goes over an encrypted
    /// endpoint only. The server must present the certificate the registration was made with, if it
    /// names one.
    /// </summary>
    /// <param name="endpoint">The endpoint, with the user if the session has one.</param>
    /// <param name="cancellationToken">Cancels the connect.</param>
    /// <param name="trial">A user and password to try instead of the stored ones, before they are stored.</param>
    public async Task<(ManagedSession Session, string? ServerCertificateThumbprint)> ConnectAsync(
        EndpointRegistration endpoint, CancellationToken cancellationToken, Credential? trial = null)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        Credential? credential = null;
        if (endpoint.User is { } user)
        {
            credential = trial ?? _credentials.Find(endpoint.Url);
            if (credential is null || !string.Equals(credential.User, user, StringComparison.Ordinal))
            {
                throw new CredentialMissingException(
                    $"No password is stored for the user {user} at {endpoint.Url}. A person enters it on the endpoints card of the chat.");
            }

            if (endpoint.SecurityMode != SecurityMode.SignAndEncrypt)
            {
                throw new EndpointNotOfferedException($"A user logs in at {endpoint.Url} over an encrypted endpoint only.");
            }
        }

        EndpointDescription? selected = null;
        foreach (var description in await _discovery.GetEndpointsAsync(endpoint.Url, ct: cancellationToken).ConfigureAwait(false))
        {
            var offered = Offered(description);
            if (offered.SecurityMode == endpoint.SecurityMode
                && string.Equals(offered.SecurityPolicy, endpoint.SecurityPolicy, StringComparison.Ordinal)
                && (credential is null ? offered.Anonymous : offered.UserName)
                && description.EndpointUrl?.StartsWith("opc.tcp://", StringComparison.OrdinalIgnoreCase) == true)
            {
                selected = description;
                break;
            }
        }

        if (selected is null)
        {
            throw new EndpointNotOfferedException(
                $"The server at {endpoint.Url} offers no endpoint with {endpoint.SecurityMode} and {endpoint.SecurityPolicy}" +
                (credential is null ? " for a session without a user." : " for a session with a user name."));
        }

        var thumbprint = Thumbprint(selected);

        // The password goes to the certificate that accepted the user, and to no other one at the same address.
        if (credential is not null && !credential.Trusts(thumbprint))
        {
            throw new ServerCertificateChangedException(
                $"The server at {endpoint.Url} presents the certificate {thumbprint}, the user {credential.User} was stored with " +
                $"{credential.ServerCertificateThumbprint}. The password is not sent; a person enters the user again if the certificate was renewed on purpose.");
        }

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

        // The managed session of the stack may try a connect again and again; a connect that does not end in
        // ConnectTimeout fails, so the back-off of the session and the LastError of the machine take over.
        using var limited = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        limited.CancelAfter(ConnectTimeout);
        var configured = new ConfiguredEndpoint(null, selected, null);
        try
        {
            var session = credential is null
                ? await _sessions.ConnectAsync(configured, limited.Token).ConfigureAwait(false)
                : await _sessions.ConnectAsync(
                    configured,
                    builder => builder
                        .WithUserIdentity(new UserIdentity(credential.User, Encoding.UTF8.GetBytes(credential.Password)))
                        .WithReconnectPolicy(new RefusedUserPolicy()),
                    limited.Token).ConfigureAwait(false);
            return (session, thumbprint);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"The server at {endpoint.Url} did not open a session within {ConnectTimeout.TotalSeconds:0} seconds.");
        }
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
        var userName = false;
        foreach (var token in description.UserIdentityTokens)
        {
            anonymous |= token.TokenType == UserTokenType.Anonymous;
            userName |= token.TokenType == UserTokenType.UserName;
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
            Thumbprint(description),
            userName);
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
