// SPDX-License-Identifier: Apache-2.0
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.DataAccessObjects;

/// <summary>
/// A job event as stored: one document per event, the whole job order after it. The id comes from the source and is
/// kept as it is, so a repeated delivery is refused as a duplicate key.
/// </summary>
internal sealed record JobEventDao : IMachineEvent
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
    public JobAction Action { get; init; }

    /// <summary>The job order the event belongs to.</summary>
    public string CorrelationId { get; init; } = string.Empty;

    /// <summary>The job order.</summary>
    public string JobOrderId { get; init; } = string.Empty;

    /// <summary>The state after the event.</summary>
    public string State { get; init; } = string.Empty;

    /// <summary>Name of the job order.</summary>
    public string? JobName { get; init; }

    /// <summary>The work master.</summary>
    public string? WorkMasterId { get; init; }

    /// <summary>Order numbers of the ERP.</summary>
    public List<string>? OrderNumbers { get; init; }

    /// <summary>Runs planned.</summary>
    public long? RunsPlanned { get; init; }

    /// <summary>Execution mode.</summary>
    public string? JobExecutionMode { get; init; }

    /// <summary>Planned start.</summary>
    public DateTime? PlannedStartTime { get; init; }

    /// <summary>Planned end.</summary>
    public DateTime? PlannedEndTime { get; init; }

    /// <summary>Start of the job order.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>End of the job order.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Parts produced.</summary>
    public double? ProducedQuantity { get; init; }

    /// <summary>Good parts.</summary>
    public double? GoodQuantity { get; init; }

    /// <summary>Runs completed.</summary>
    public long? RunsCompleted { get; init; }

    /// <summary>Time in production, in seconds.</summary>
    public double? ActualProductionTime { get; init; }

    /// <summary>Result of the job order.</summary>
    public string? JobResult { get; init; }

    /// <summary>Number of the job event at its source.</summary>
    public long? Seq { get; init; }
}
