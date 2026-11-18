// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// The last known state of one job order, put together from its CloudEvents when it is read: what is ordered (the
/// entry of <c>JobMonitoring.JobOrders</c>), what came of it (the entry of <c>JobMonitoring.JobOrderResults</c>, from
/// its start on), and what its program executions add up to. Units of the data model: energy in watt hours.
/// </summary>
public sealed record JobOrderDtoV1
{
    /// <summary>The machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The job order.</summary>
    public required string JobOrderId { get; init; }

    /// <summary>Its state after its last event (ISA-95).</summary>
    public required string State { get; init; }

    /// <summary>The type of its last event, such as <c>JobMonitoring.JobOrderEnded</c>.</summary>
    public required string LastType { get; init; }

    /// <summary>When its last event happened.</summary>
    public DateTime LastChange { get; init; }

    /// <summary>When it was first seen.</summary>
    public DateTime FirstSeen { get; init; }

    /// <summary>Whether it left the job order list of the machine.</summary>
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

    /// <summary>Parts produced.</summary>
    public double? ProducedQuantity { get; init; }

    /// <summary>Of those, the good ones.</summary>
    public double? GoodQuantity { get; init; }

    /// <summary>Runs completed.</summary>
    public long? RunsCompleted { get; init; }

    /// <summary>Time in production, in seconds, at its last result.</summary>
    public double? ActualProductionTime { get; init; }

    /// <summary>Unknown until it ends, then Successful or Unsuccessful.</summary>
    public string? JobResult { get; init; }

    /// <summary>How many program executions it had.</summary>
    public int ProgramExecutions { get; init; }

    /// <summary>Electric energy of its ended and aborted program executions, in watt hours.</summary>
    public double EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of its ended and aborted program executions, in watt hours.</summary>
    public double EnergyCompressedAir { get; init; }
}

/// <summary>A job order with the events it went through and its program executions, oldest first.</summary>
public sealed record JobOrderHistoryDtoV1
{
    /// <summary>The last known state of the job order, its result included.</summary>
    public required JobOrderDtoV1 JobOrder { get; init; }

    /// <summary>Its CloudEvents, oldest first.</summary>
    public required IReadOnlyList<MachineEventDtoV1> History { get; init; }

    /// <summary>Its program executions, from start to end, oldest first.</summary>
    public required IReadOnlyList<ProgramExecutionDtoV1> ProgramExecutions { get; init; }
}

/// <summary>
/// One program execution from its start to its end: its Started event paired with its Ended or Aborted event by the
/// ExecutionId, with the sums its end carries (duration in seconds, energy in watt hours).
/// </summary>
public sealed record ProgramExecutionDtoV1
{
    /// <summary>The machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The program execution.</summary>
    public required string ExecutionId { get; init; }

    /// <summary>The job order it belongs to, if any.</summary>
    public string? JobOrderId { get; init; }

    /// <summary>The work master it carried out.</summary>
    public string? WorkMasterId { get; init; }

    /// <summary>Its state after its last event: Running, Interrupted, Ended or Aborted.</summary>
    public required string State { get; init; }

    /// <summary>When it started.</summary>
    public DateTime StartTime { get; init; }

    /// <summary>When it ended or was aborted; null while it runs.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Ended or Aborted; null while it runs.</summary>
    public string? EndType { get; init; }

    /// <summary>How often it was interrupted.</summary>
    public int Interruptions { get; init; }

    /// <summary>Duration in seconds, its interruptions included; at its end.</summary>
    public double? Duration { get; init; }

    /// <summary>Parts produced; at its end.</summary>
    public double? PartsProduced { get; init; }

    /// <summary>Electric energy in watt hours; at its end.</summary>
    public double? EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air in watt hours; at its end.</summary>
    public double? EnergyCompressedAir { get; init; }
}
