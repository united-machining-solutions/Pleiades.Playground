using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Pleiades.Playground.Sites.Api.DataAccessObjects;

/// <summary>
/// A machine on a site as stored: the serial number is the document id, so a machine stands on one site at most.
/// </summary>
internal sealed class PlacementDao
{
    /// <summary>The serial number, the <c>{SerialNumber}</c> of <c>machines/{SerialNumber}</c> in the MQTT binding.</summary>
    [BsonId]
    public required string SerialNumber { get; init; }

    /// <summary>The site the machine stands on.</summary>
    public required string SiteId { get; init; }

    /// <summary>The hall of the site, one of its halls, or <see langword="null"/> when not given.</summary>
    public string? Hall { get; init; }

    /// <summary>The name people know the machine by, or <see langword="null"/> when not given.</summary>
    public string? DisplayName { get; init; }

    /// <summary>When the machine was put on its current site (UTC).</summary>
    [BsonDateTimeOptions(Kind = DateTimeKind.Utc, Representation = BsonType.DateTime)]
    public required DateTime PlacedAt { get; init; }
}
