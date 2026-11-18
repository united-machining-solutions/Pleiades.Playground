using System.Security.Cryptography;
using System.Text.Json;
using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// The entity tag of a site and the conditions of a write on it: <c>If-None-Match: *</c> makes a site only where
/// there is none, <c>If-Match</c> writes only the site that was read. A write without them is unconditional, as
/// before. The tag is made from what a person can change of a site, so it needs nothing stored.
/// </summary>
internal static class SiteTags
{
    /// <summary>
    /// The entity tag of a site, a strong tag in quotes: the first 16 hex digits of a SHA-256 over its company,
    /// name and halls. It changes whenever one of them changes.
    /// </summary>
    internal static string Of(SiteDao site)
    {
        var content = JsonSerializer.SerializeToUtf8Bytes(new object[] { site.Company, site.Name, site.Halls });
        var hash = SHA256.HashData(content);
        return $"\"{Convert.ToHexStringLower(hash.AsSpan(0, 8))}\"";
    }

    /// <summary>
    /// Whether a write may go ahead on the site as it is now (<paramref name="existing"/>, null where there is
    /// none). The sentence of the refusal for a 412, or <see langword="null"/>.
    /// </summary>
    internal static string? CheckConditions(string siteId, SiteDao? existing, string? ifMatch, string? ifNoneMatch)
    {
        if (!string.IsNullOrWhiteSpace(ifNoneMatch) && existing is not null && Matches(ifNoneMatch, Of(existing)))
        {
            return $"The site '{siteId}' exists already.";
        }

        if (string.IsNullOrWhiteSpace(ifMatch))
        {
            return null;
        }

        if (existing is null)
        {
            return $"There is no site '{siteId}' to change.";
        }

        return Matches(ifMatch, Of(existing)) ? null : $"The site '{siteId}' was changed since it was read.";
    }

    /// <summary>
    /// Whether a list of entity tags, as <c>If-Match</c> and <c>If-None-Match</c> carry it, names this tag. <c>*</c>
    /// names every tag. Tags are compared strongly: a weak tag (<c>W/"…"</c>) names none.
    /// </summary>
    private static bool Matches(string header, string tag) =>
        header.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Any(one => one == "*" || string.Equals(one, tag, StringComparison.Ordinal));
}
