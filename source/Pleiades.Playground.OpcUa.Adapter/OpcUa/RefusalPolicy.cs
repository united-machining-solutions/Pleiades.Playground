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
    /// Whether a connect failed because the server refused the identity of the session: an anonymous session the
    /// server does not take after all, or a user. Looks through the causes of the exception.
    /// </summary>
    public static bool IsRefusedIdentity(Exception? exception)
    {
        for (var cause = exception; cause is not null; cause = cause.InnerException)
        {
            if (cause is ServiceResultException refused && IsRefusedUser(refused.StatusCode))
            {
                return true;
            }
        }

        return false;
    }

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

    /// <summary>
    /// The reason a server gave with a refusal of status <paramref name="status"/>, or null if it gave none. The OPC UA
    /// stack writes a refusal as <c>[80130000] (BadSecurityChecksFailed) 'reason'</c>; the reason is the text in quotes
    /// after the status, also where a JSON text escaped the quotes as <c>'</c>. A text that is no more than the
    /// status gives none.
    /// </summary>
    /// <param name="text">The message of an exception, or the text of a tool result.</param>
    /// <param name="status">The symbolic name of the status, for example <c>BadSecurityChecksFailed</c>.</param>
    /// <param name="quotedOnly">True to take only a reason in quotes after the status; false to take the whole text otherwise.</param>
    public static string? ReasonIn(string? text, string status, bool quotedOnly = false)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var unescaped = text.Replace("\\u0027", "'", StringComparison.Ordinal);
        var match = System.Text.RegularExpressions.Regex.Match(
            unescaped, $@"\({System.Text.RegularExpressions.Regex.Escape(status)}\)\s*'(?<reason>[^']*)'");
        var reason = match.Success ? match.Groups["reason"].Value.Trim() : quotedOnly ? string.Empty : unescaped.Trim();
        return reason.Length == 0
            || string.Equals(reason, status, StringComparison.OrdinalIgnoreCase)
            || reason.Contains($"({status})", StringComparison.Ordinal)
            ? null
            : reason;
    }

    /// <summary>
    /// Whether the reason of a refusal says that the server cannot handle the security of the endpoint, although it
    /// offers it: a signature algorithm or a security policy it does not expect, as a server answers that has the
    /// policy <c>Aes256_Sha256_RsaPss</c> but no RSA-PSS signatures ("Unexpected SignatureData algorithm"). Trusting a
    /// certificate does not help then; another security does.
    /// </summary>
    public static bool IsUnsupportedSecurity(string? reason) =>
        reason is not null
        && (reason.Contains("SignatureData", StringComparison.OrdinalIgnoreCase)
            || reason.Contains("SecurityPolicy", StringComparison.OrdinalIgnoreCase)
            || reason.Contains("security policy", StringComparison.OrdinalIgnoreCase));

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
