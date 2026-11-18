using MongoDB.Bson.Serialization.Attributes;

namespace Pleiades.Playground.Sites.Api.DataAccessObjects;

/// <summary>
/// A site as stored: the site id is the document id, so a site exists once. The document may also carry the
/// counter <see cref="ClaimsElement"/>, which only makes concurrent transactions on the site conflict.
/// </summary>
[BsonIgnoreExtraElements]
internal sealed class SiteDao
{
    /// <summary>The element a claim of the site in a transaction increments; it means nothing else.</summary>
    internal const string ClaimsElement = "Claims";

    /// <summary>The site id, the <c>{SiteId}</c> of <c>sites/{SiteId}</c> in the MQTT binding.</summary>
    [BsonId]
    public required string SiteId { get; init; }

    /// <summary>The company the site belongs to.</summary>
    public required string Company { get; init; }

    /// <summary>The name of the plant.</summary>
    public required string Name { get; init; }

    /// <summary>The halls of the site, in the order they were given.</summary>
    public required IReadOnlyList<string> Halls { get; init; }
}
