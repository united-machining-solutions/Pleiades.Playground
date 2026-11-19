using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>An endpoint a server offers, reduced to what the choice depends on.</summary>
/// <param name="Url">The endpoint URL as the server announces it.</param>
/// <param name="SecurityMode">The message security mode.</param>
/// <param name="SecurityPolicy">The short name of the policy, for example <c>Basic256Sha256</c>.</param>
/// <param name="Anonymous">Whether the endpoint accepts a session without a user.</param>
/// <param name="ServerCertificateThumbprint">SHA-1 thumbprint of the certificate the server presents.</param>
/// <param name="UserName">Whether the endpoint accepts a session with a user name and a password.</param>
internal sealed record OfferedEndpoint(
    string Url,
    SecurityMode SecurityMode,
    string SecurityPolicy,
    bool Anonymous,
    string? ServerCertificateThumbprint,
    bool UserName = false);

/// <summary>An offered endpoint with its place in the order.</summary>
/// <param name="Endpoint">The endpoint.</param>
/// <param name="Score">Higher is stronger. Only the order matters.</param>
/// <param name="Recommended">True for the one the adapter takes: the strongest, or the one a person chose.</param>
/// <param name="Weak">True without encryption or with a policy that is no longer considered safe.</param>
/// <param name="WithUser">
/// True if a session on this endpoint logs in with the user a person stored: the endpoint is encrypted and takes a
/// user name. A user a person stored goes before an anonymous session; without one, the session is anonymous.
/// </param>
internal sealed record RankedEndpoint(OfferedEndpoint Endpoint, int Score, bool Recommended, bool Weak, bool WithUser = false);

/// <summary>
/// Orders the endpoints of a server from strongest to weakest: encryption before signing only, then the
/// strength of the policy. Without a choice of a person the adapter takes the strongest; a language model
/// never chooses. A person may choose a weaker one, one without security included, on the endpoints card.
/// </summary>
internal static class EndpointRanking
{
    /// <summary>The prefix every security policy URI of the OPC Foundation starts with.</summary>
    public const string PolicyUriPrefix = "http://opcfoundation.org/UA/SecurityPolicy#";

    private static readonly string[] PoliciesWeakestFirst =
    [
        "None",
        "Basic128Rsa15",
        "Basic256",
        "Basic256Sha256",
        "Aes128_Sha256_RsaOaep",
        "Aes256_Sha256_RsaPss",
    ];

    private static readonly HashSet<string> BrokenPolicies = new(StringComparer.Ordinal) { "None", "Basic128Rsa15", "Basic256" };

    /// <summary>The short name of a policy URI: the part after <c>#</c>.</summary>
    public static string ShortName(string? policyUri)
    {
        if (string.IsNullOrEmpty(policyUri))
        {
            return "None";
        }

        var hash = policyUri.LastIndexOf('#');
        return hash < 0 ? policyUri : policyUri[(hash + 1)..];
    }

    /// <summary>The policy URI of a short name.</summary>
    public static string PolicyUri(string shortName) => PolicyUriPrefix + shortName;

    /// <summary>Whether a session on this endpoint is neither encrypted nor safely signed.</summary>
    public static bool IsWeak(SecurityMode mode, string policy) =>
        mode != SecurityMode.SignAndEncrypt || BrokenPolicies.Contains(policy);

    /// <summary>
    /// Higher is stronger. A policy this list does not know ranks above the known ones of its
    /// mode: the list names what is old, and what a server adds later is newer.
    /// </summary>
    public static int Score(SecurityMode mode, string policy)
    {
        var known = Array.IndexOf(PoliciesWeakestFirst, policy);
        var strength = known < 0 ? PoliciesWeakestFirst.Length : known;
        return ((int)mode * 100) + strength;
    }

    /// <summary>
    /// The endpoints the adapter can open a session on, strongest first: every endpoint that takes an anonymous
    /// session, and, if a person stored a user, every encrypted endpoint that takes a user name. Where a person stored
    /// a user, a session logs in with it on every encrypted endpoint that takes a user name
    /// (<see cref="RankedEndpoint.WithUser"/>), else it is anonymous. The one a person
    /// chose is the one taken (<see cref="RankedEndpoint.Recommended"/>), if the server still offers it; else the
    /// strongest.
    /// </summary>
    /// <param name="offered">The endpoints of the server.</param>
    /// <param name="withStoredUser">Whether a person stored a user for the server.</param>
    /// <param name="choice">The security a person chose for the server, or null.</param>
    public static IReadOnlyList<RankedEndpoint> ForSession(IEnumerable<OfferedEndpoint> offered, bool withStoredUser, SecurityChoice? choice = null)
    {
        ArgumentNullException.ThrowIfNull(offered);
        var ordered = offered
            .Where(endpoint => endpoint.Anonymous || (withStoredUser && endpoint.UserName && endpoint.SecurityMode == SecurityMode.SignAndEncrypt))
            .Select(endpoint => (endpoint, score: Score(endpoint.SecurityMode, endpoint.SecurityPolicy)))
            .OrderByDescending(pair => pair.score)
            .ToList();
        var chosen = choice is null ? -1 : ordered.FindIndex(pair => choice.Matches(pair.endpoint.SecurityMode, pair.endpoint.SecurityPolicy));
        var taken = chosen < 0 ? 0 : chosen;
        return
        [
            .. ordered.Select((pair, index) => new RankedEndpoint(
                pair.endpoint,
                pair.score,
                Recommended: index == taken,
                Weak: IsWeak(pair.endpoint.SecurityMode, pair.endpoint.SecurityPolicy),
                WithUser: withStoredUser && pair.endpoint.UserName && pair.endpoint.SecurityMode == SecurityMode.SignAndEncrypt)),
        ];
    }

    /// <summary>
    /// The endpoints a session can use, strongest first: without a user, or with a user name and a
    /// password. A password goes over an encrypted endpoint only, so an endpoint that only signs, or
    /// does neither, is not offered to a session with a user at all.
    /// </summary>
    public static IReadOnlyList<RankedEndpoint> Rank(IEnumerable<OfferedEndpoint> offered, bool withUser = false)
    {
        ArgumentNullException.ThrowIfNull(offered);
        var ordered = offered
            .Where(endpoint => withUser ? endpoint.UserName && endpoint.SecurityMode == SecurityMode.SignAndEncrypt : endpoint.Anonymous)
            .Select(endpoint => (endpoint, score: Score(endpoint.SecurityMode, endpoint.SecurityPolicy)))
            .OrderByDescending(pair => pair.score)
            .ToList();
        return
        [
            .. ordered.Select((pair, index) => new RankedEndpoint(
                pair.endpoint,
                pair.score,
                Recommended: index == 0,
                Weak: IsWeak(pair.endpoint.SecurityMode, pair.endpoint.SecurityPolicy),
                WithUser: withUser)),
        ];
    }
}
