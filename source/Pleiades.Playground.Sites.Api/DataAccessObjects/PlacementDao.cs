using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Pleiades.Playground.Sites.Api.DataAccessObjects;

/// <summary>
/// A machine on a site as stored: the machine id is the document id, so a machine stands on one site at most.
/// A field this version does not know is left out when a document is read, so a version before a new field
/// still reads what a later one wrote.
/// </summary>
[BsonIgnoreExtraElements]
internal sealed class PlacementDao
{
    /// <summary>The machine id, the <c>{MachineId}</c> of <c>machines/{MachineId}</c> in the MQTT binding: <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>.</summary>
    [BsonId]
    public required string MachineId { get; init; }

    /// <summary>The site the machine stands on.</summary>
    public required string SiteId { get; init; }

    /// <summary>The hall of the site, one of its halls, or <see langword="null"/> when not given.</summary>
    public string? Hall { get; init; }

    /// <summary>The name people know the machine by, or <see langword="null"/> when not given.</summary>
    public string? DisplayName { get; init; }

    /// <summary>When the machine was put on its current site (UTC).</summary>
    [BsonDateTimeOptions(Kind = DateTimeKind.Utc, Representation = BsonType.DateTime)]
    public required DateTime PlacedAt { get; init; }

    /// <summary>Where in its hall the machine stands, or <see langword="null"/> when nobody said. Only a machine in a hall has one.</summary>
    [BsonIgnoreIfNull]
    public PositionDao? Position { get; init; }
}

/// <summary>
/// A position on the plan of a hall as stored: the middle of the machine, in metre from the upper left corner.
/// </summary>
internal sealed class PositionDao
{
    /// <summary>How far to the right of the left edge of the plan, in metre.</summary>
    public required double X { get; init; }

    /// <summary>How far below the upper edge of the plan, in metre.</summary>
    public required double Y { get; init; }
}
