// SPDX-License-Identifier: Apache-2.0
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// A work master event as stored: one document per event, the whole program execution after it. The id comes from
/// the source and is kept as it is, so a repeated delivery is refused as a duplicate key.
/// </summary>
internal sealed record WorkMasterEventDao : IMachineEvent
{
    /// <summary>When the event happened.</summary>
    public DateTime Timestamp { get; set; }

    /// <summary>Id of the event, as the source gave it.</summary>
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public required string Id { get; set; }

    /// <summary>Machine id.</summary>
    public required string MId { get; set; }

    /// <summary>What happened.</summary>
    [BsonRepresentation(BsonType.String)]
    public WorkMasterAction Action { get; init; }

    /// <summary>The program execution the event belongs to.</summary>
    public string CorrelationId { get; init; } = string.Empty;

    /// <summary>The program execution.</summary>
    public string ExecutionId { get; init; } = string.Empty;

    /// <summary>The work master.</summary>
    public string? WorkMasterId { get; init; }

    /// <summary>The job order.</summary>
    public string? JobOrderId { get; init; }

    /// <summary>The state after the event.</summary>
    public string State { get; init; } = string.Empty;

    /// <summary>Start of the program execution.</summary>
    public DateTime StartTime { get; init; }

    /// <summary>Duration in seconds.</summary>
    public double? Duration { get; init; }

    /// <summary>Parts produced.</summary>
    public double? PartsProduced { get; init; }

    /// <summary>Electric energy in joule.</summary>
    public double? EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air in joule.</summary>
    public double? EnergyCompressedAir { get; init; }

    /// <summary>Number of the work master event at its source.</summary>
    public long? Seq { get; init; }
}
