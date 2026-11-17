using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// What a site id, a serial number and the bodies of the write endpoints must satisfy. Every check returns the
/// sentence the caller reads in a 400, or <see langword="null"/> when the value is fine.
/// </summary>
internal static class SiteRules
{
    // The MQTT binding forbids these three in {SiteId} and {SerialNumber}: '/' separates topic levels,
    // '+' and '#' are the wildcards of a subscription.
    private static readonly char[] TopicReserved = ['/', '+', '#'];

    /// <summary>
    /// A site id or serial number names one level of an MQTT topic: it is not blank and holds no <c>/</c>,
    /// <c>+</c> or <c>#</c>.
    /// </summary>
    internal static string? CheckTopicLevel(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return $"The {name} is required.";
        }

        return value.IndexOfAny(TopicReserved) >= 0
            ? $"The {name} '{value}' contains '/', '+' or '#', which a level of an MQTT topic cannot hold."
            : null;
    }

    /// <summary>A site needs a company and a name; its halls are each named once and none is blank.</summary>
    internal static string? CheckSite(SiteRequestV1 site)
    {
        if (string.IsNullOrWhiteSpace(site.Company))
        {
            return "The company is required.";
        }

        if (string.IsNullOrWhiteSpace(site.Name))
        {
            return "The name is required.";
        }

        var halls = site.Halls ?? [];
        if (halls.Any(string.IsNullOrWhiteSpace))
        {
            return "A hall has no name.";
        }

        var twice = halls.GroupBy(h => h, StringComparer.Ordinal).FirstOrDefault(g => g.Count() > 1);
        return twice is null ? null : $"The hall '{twice.Key}' is named more than once.";
    }

    /// <summary>
    /// A placement names a site, and, where given, a hall of that site and a display name that is not blank.
    /// Whether the site exists is checked against the store, see <see cref="CheckPlacementOnSite"/>.
    /// </summary>
    internal static string? CheckPlacement(PlacementRequestV1 placement)
    {
        if (CheckTopicLevel(placement.SiteId, "site id") is { } siteError)
        {
            return siteError;
        }

        if (placement.Hall is not null && string.IsNullOrWhiteSpace(placement.Hall))
        {
            return "The hall, when given, has a name.";
        }

        return placement.DisplayName is not null && string.IsNullOrWhiteSpace(placement.DisplayName)
            ? "The display name, when given, is not blank."
            : null;
    }

    /// <summary>The site of a placement exists, and its hall, when given, is one of the halls of that site.</summary>
    internal static string? CheckPlacementOnSite(PlacementRequestV1 placement, SiteDao? site)
    {
        if (site is null)
        {
            return $"There is no site '{placement.SiteId}'. Create it with PUT /sites/{placement.SiteId} first.";
        }

        return placement.Hall is null || site.Halls.Contains(placement.Hall, StringComparer.Ordinal)
            ? null
            : $"The site '{site.SiteId}' has no hall '{placement.Hall}'.";
    }
}
