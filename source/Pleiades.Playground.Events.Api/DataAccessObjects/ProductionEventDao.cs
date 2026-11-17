// SPDX-License-Identifier: Apache-2.0
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// A production event as stored: one document per event, the whole state after it. The id comes from the source and
/// is kept as it is, so a repeated delivery is refused as a duplicate key.
/// </summary>
internal sealed record ProductionEventDao : IMachineEvent
{
    /// <summary>When the event happened.</summary>
    public DateTime Timestamp { get; set; }

    /// <summary>Id of the event, as the source gave it.</summary>
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public required string Id { get; set; }

    /// <summary>Machine id.</summary>
    public required string MId { get; set; }

    /// <summary>Job order or program execution.</summary>
    [BsonRepresentation(BsonType.String)]
    public ProductionSubject Subject { get; init; }

    /// <summary>What happened.</summary>
    [BsonRepresentation(BsonType.String)]
    public ProductionAction Action { get; init; }

    /// <summary>The job order or program execution the event belongs to.</summary>
    public string CorrelationId { get; init; } = string.Empty;

    /// <summary>The job order.</summary>
    public string? JobOrderId { get; init; }

    /// <summary>The program execution.</summary>
    public string? ExecutionId { get; init; }

    /// <summary>The work master.</summary>
    public string? WorkMaster { get; init; }

    /// <summary>The state after the event.</summary>
    public string State { get; init; } = string.Empty;

    /// <summary>Start of the job order or program execution.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>End of the job order.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Parts produced by the job order.</summary>
    public double? ProducedQuantity { get; init; }

    /// <summary>Good parts of the job order.</summary>
    public double? GoodQuantity { get; init; }

    /// <summary>Duration of the program execution in seconds.</summary>
    public double? Duration { get; init; }

    /// <summary>Parts produced by the program execution.</summary>
    public double? PartsProduced { get; init; }

    /// <summary>Electric energy of the program execution in joule.</summary>
    public double? EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of the program execution in joule.</summary>
    public double? EnergyCompressedAir { get; init; }

    /// <summary>Number of the production event at its source.</summary>
    public long? Seq { get; init; }
}
