// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// The last known state of one job order, put together from its job events when it is read: what is ordered and
/// what came of it after its last event, and what its program executions add up to.
/// </summary>
public sealed record JobOrderDtoV1
{
    /// <summary>Machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The job order.</summary>
    public required string JobOrderId { get; init; }

    /// <summary>Its state after its last event.</summary>
    public required string State { get; init; }

    /// <summary>Its last event.</summary>
    public JobAction LastAction { get; init; }

    /// <summary>When its last event happened.</summary>
    public DateTime LastChange { get; init; }

    /// <summary>When it was first seen.</summary>
    public DateTime FirstSeen { get; init; }

    /// <summary>Whether it left the job order list of the machine (its last event is Removed).</summary>
    public bool Removed { get; init; }

    /// <summary>Name of the job order.</summary>
    public string? JobName { get; init; }

    /// <summary>The work master it carries out.</summary>
    public string? WorkMasterId { get; init; }

    /// <summary>Order numbers of the ERP.</summary>
    public IReadOnlyList<string>? OrderNumbers { get; init; }

    /// <summary>Runs planned.</summary>
    public long? RunsPlanned { get; init; }

    /// <summary>SimulationMode, TestMode or ProductionMode.</summary>
    public string? JobExecutionMode { get; init; }

    /// <summary>Planned start, if the machine knows it.</summary>
    public DateTime? PlannedStartTime { get; init; }

    /// <summary>Planned end, if the machine knows it.</summary>
    public DateTime? PlannedEndTime { get; init; }

    /// <summary>When it started; null before its start, as every field of its result.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>When it ended or was aborted.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Parts produced, good ones and scrap.</summary>
    public double? ProducedQuantity { get; init; }

    /// <summary>Of those, the good ones.</summary>
    public double? GoodQuantity { get; init; }

    /// <summary>Runs completed.</summary>
    public long? RunsCompleted { get; init; }

    /// <summary>Time it was in production, in seconds, at its last event.</summary>
    public double? ActualProductionTime { get; init; }

    /// <summary>Unknown until it ends, then Successful or Unsuccessful.</summary>
    public string? JobResult { get; init; }

    /// <summary>How many program executions it had.</summary>
    public int ProgramExecutions { get; init; }

    /// <summary>Electric energy of its ended and aborted program executions, in joule.</summary>
    public double EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of its ended and aborted program executions, in joule.</summary>
    public double EnergyCompressedAir { get; init; }
}

/// <summary>A job order with the events it went through and its program executions, oldest first.</summary>
public sealed record JobOrderHistoryDtoV1
{
    /// <summary>The last known state of the job order, its result included.</summary>
    public required JobOrderDtoV1 JobOrder { get; init; }

    /// <summary>Its job events, oldest first.</summary>
    public required IReadOnlyList<JobEventDtoV1> History { get; init; }

    /// <summary>Its program executions, from start to end, oldest first.</summary>
    public required IReadOnlyList<ProgramExecutionPairDtoV1> ProgramExecutions { get; init; }
}
