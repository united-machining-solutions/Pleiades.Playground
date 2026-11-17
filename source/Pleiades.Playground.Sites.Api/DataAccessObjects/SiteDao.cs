using MongoDB.Bson.Serialization.Attributes;

namespace Pleiades.Playground.Sites.Api.DataAccessObjects;

/// <summary>
/// A site as stored: the site id is the document id, so a site exists once.
/// </summary>
internal sealed class SiteDao
{
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
