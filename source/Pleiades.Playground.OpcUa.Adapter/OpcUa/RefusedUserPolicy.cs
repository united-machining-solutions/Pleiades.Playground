using Opc.Ua;
using Opc.Ua.Client;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// The reconnect policy of a session with a user. The managed session of the OPC UA stack tries a
/// connect again and again, also when the server refused the user: a wrong password would never end
/// in an error. This policy stops on such a refusal, so the connect fails with the reason, and leaves
/// every other failure to the default policy of the stack.
/// </summary>
internal sealed class RefusedUserPolicy : IReconnectPolicy
{
    private readonly ReconnectPolicy _default = new();

    /// <summary>Whether the server refused the user, its password or its token: trying again does not help.</summary>
    public static bool IsRefusedUser(StatusCode status) =>
        status == StatusCodes.BadUserAccessDenied
        || status == StatusCodes.BadIdentityTokenInvalid
        || status == StatusCodes.BadIdentityTokenRejected
        || status == StatusCodes.BadUserSignatureInvalid;

    /// <inheritdoc />
    public TimeSpan? GetNextDelay(int attempt, CancellationToken ct = default) => _default.GetNextDelay(attempt, ct);

    /// <inheritdoc />
    public bool TryGetNextDelay(int attempt, StatusCode lastStatus, TimeSpan? serverRetryAfter, out TimeSpan? delay, CancellationToken ct = default)
    {
        if (IsRefusedUser(lastStatus))
        {
            delay = null;
            return true;
        }

        return _default.TryGetNextDelay(attempt, lastStatus, serverRetryAfter, out delay, ct);
    }

    /// <inheritdoc />
    public void Reset() => _default.Reset();
}
