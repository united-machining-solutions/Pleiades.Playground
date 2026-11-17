// SPDX-License-Identifier: Apache-2.0
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// A CloudEvent of a machine as stored: the event unchanged in <see cref="Event"/>, and beside it what the queries
/// filter on. The key is the source and the id of the event, so a repeated delivery is refused as a duplicate.
/// </summary>
internal sealed record MachineEventDao
{
    /// <summary><c>{source} {id}</c>: a CloudEvent is unique by its source and its id.</summary>
    [BsonId]
    public required string Key { get; init; }

    /// <summary>The machine id of the topic.</summary>
    public required string MId { get; init; }

    /// <summary>The group, the first segment of the type.</summary>
    public required string Group { get; init; }

    /// <summary>The type of the CloudEvent.</summary>
    public required string Type { get; init; }

    /// <summary>The source of the CloudEvent.</summary>
    public required string Source { get; init; }

    /// <summary>The id of the CloudEvent.</summary>
    public required string EventId { get; init; }

    /// <summary>When the event happened.</summary>
    public DateTime Time { get; init; }

    /// <summary>The sequence attribute as it came.</summary>
    public string? Sequence { get; init; }

    /// <summary>The run of the adapter, the part of the sequence before the dot.</summary>
    public string? SequencePrefix { get; init; }

    /// <summary>The count of the event in its group, the part of the sequence after the dot.</summary>
    public long? SequenceCount { get; init; }

    /// <summary>The correlationid attribute.</summary>
    public string? CorrelationId { get; init; }

    /// <summary>The data of the CloudEvent.</summary>
    public required BsonDocument Data { get; init; }

    /// <summary>The whole CloudEvent as it came.</summary>
    public required BsonDocument Event { get; init; }

    /// <summary>When it was stored.</summary>
    public DateTime ReceivedAt { get; init; }
}
