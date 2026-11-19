using Opc.Ua;
using Opc.Ua.Client;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// The reconnect policy of every session of the adapter. The managed session of the OPC UA stack tries
/// a connect again and again, also when the server refused the user or a certificate was rejected: a
/// wrong password, a certificate without the ApplicationUri of its server or a server that does not
/// trust the adapter would end in a timeout that hides the reason. This policy stops on such a refusal, so the connect fails with the reason, and
/// leaves every other failure to the default policy of the stack. The adapter itself tries again later
/// (SharedSession), so a refusal fixed on the server is picked up.
/// </summary>
internal sealed class RefusalPolicy : IReconnectPolicy
{
    private readonly ReconnectPolicy _default = new();

    /// <summary>Whether the server refused the user, its password or its token: trying again does not help.</summary>
    public static bool IsRefusedUser(StatusCode status) =>
        status == StatusCodes.BadUserAccessDenied
        || status == StatusCodes.BadIdentityTokenInvalid
        || status == StatusCodes.BadIdentityTokenRejected
        || status == StatusCodes.BadUserSignatureInvalid;

    /// <summary>
    /// Whether a certificate was rejected, the one of the server by the adapter or the one of the adapter by
    /// the server: trying again does not help until a person fixes or trusts the certificate.
    /// </summary>
    public static bool IsRejectedCertificate(StatusCode status) =>
        status == StatusCodes.BadCertificateInvalid
        || status == StatusCodes.BadCertificateUriInvalid
        || status == StatusCodes.BadCertificateHostNameInvalid
        || status == StatusCodes.BadCertificateTimeInvalid
        || status == StatusCodes.BadCertificateIssuerTimeInvalid
        || status == StatusCodes.BadCertificateUseNotAllowed
        || status == StatusCodes.BadCertificateIssuerUseNotAllowed
        || status == StatusCodes.BadCertificateUntrusted
        || status == StatusCodes.BadCertificateRevoked
        || status == StatusCodes.BadCertificateIssuerRevoked
        || status == StatusCodes.BadCertificateRevocationUnknown
        || status == StatusCodes.BadCertificateIssuerRevocationUnknown
        || status == StatusCodes.BadCertificateChainIncomplete
        || status == StatusCodes.BadCertificatePolicyCheckFailed;

    /// <summary>
    /// Whether the server most likely does not trust the certificate of the adapter. A server does not say why it
    /// refused a client: OPC UA Part 4, 7.38.2 asks it to answer <c>BadSecurityChecksFailed</c> instead of the
    /// reason. Some servers answer <c>BadCertificateUntrusted</c>; the adapter itself accepts the certificate of
    /// every server, so that one comes from the server too. Trying again does not help until a person trusts the
    /// certificate of the adapter on the server.
    /// </summary>
    public static bool IsUntrustedClient(StatusCode status) =>
        status == StatusCodes.BadSecurityChecksFailed
        || status == StatusCodes.BadCertificateUntrusted;

    /// <inheritdoc />
    public TimeSpan? GetNextDelay(int attempt, CancellationToken ct = default) => _default.GetNextDelay(attempt, ct);

    /// <inheritdoc />
    public bool TryGetNextDelay(int attempt, StatusCode lastStatus, TimeSpan? serverRetryAfter, out TimeSpan? delay, CancellationToken ct = default)
    {
        if (IsRefusedUser(lastStatus) || IsRejectedCertificate(lastStatus) || IsUntrustedClient(lastStatus))
        {
            delay = null;
            return true;
        }

        return _default.TryGetNextDelay(attempt, lastStatus, serverRetryAfter, out delay, ct);
    }

    /// <inheritdoc />
    public void Reset() => _default.Reset();
}
