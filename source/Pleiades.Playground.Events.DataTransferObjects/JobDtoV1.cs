// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// One job across machines, put together from the CloudEvents of its job orders when it is read. A job is what a MES
/// orders under one <c>JobOrderID</c>; every machine it passes has a job order of its own with that same id, and
/// each of them is one step of the job. Units of the data model: durations in seconds, energy in watt hours.
/// </summary>
public sealed record JobDtoV1
{
    /// <summary>The job order id, the same on every machine the job passes: the id of the MES.</summary>
    public required string JobOrderId { get; init; }

    /// <summary>The order numbers of the ERP, of every step, each once.</summary>
    public required IReadOnlyList<string> OrderNumbers { get; init; }

    /// <summary>Where the job stands now.</summary>
    public required JobPositionDtoV1 Position { get; init; }

    /// <summary>Its steps, one per machine, by start, then planned start, then first seen.</summary>
    public required IReadOnlyList<JobStepDtoV1> Steps { get; init; }

    /// <summary>When its first step started; null before.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>When its last step ended or was aborted, once the job is ended or aborted; null before.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Electric energy of the program executions of every step, in watt hours.</summary>
    public double EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of the program executions of every step, in watt hours.</summary>
    public double EnergyCompressedAir { get; init; }
}

/// <summary>Where a job stands now, from the states of its steps.</summary>
public sealed record JobPositionDtoV1
{
    /// <summary>
    /// <c>Running</c> or <c>Interrupted</c> on a machine; <c>Waiting</c> before its first step started;
    /// <c>Between</c> when a step ended and a later one has not started; <c>Ended</c> when its last known step
    /// ended; <c>Aborted</c> when its last started step was aborted.
    /// </summary>
    public required string State { get; init; }

    /// <summary>
    /// The index in <see cref="JobDtoV1.Steps"/> of the step it is at: the one that runs or is interrupted, the one it
    /// waits for (Waiting, Between), or the last one (Ended, Aborted).
    /// </summary>
    public int StepIndex { get; init; }

    /// <summary>The machine of that step.</summary>
    public required string MId { get; init; }

    /// <summary>
    /// Since when it stands there, if known: the start of the running or interrupted step, the end of the step
    /// before (Between), the end of the last step (Ended, Aborted); null while it waits for its first step.
    /// </summary>
    public DateTime? Since { get; init; }
}

/// <summary>
/// One step of a job: its job order on one machine, with what came of it and what its program executions add up to.
/// A job order id may stand on a machine more than once, after the machine started anew: the step is its last life
/// there, and only the program executions from the start of that life on count for it.
/// </summary>
public sealed record JobStepDtoV1
{
    /// <summary>The machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The state of the job order after its last event (ISA-95).</summary>
    public required string State { get; init; }

    /// <summary>When its first event of this life happened.</summary>
    public DateTime FirstSeen { get; init; }

    /// <summary>When its last event happened.</summary>
    public DateTime LastChange { get; init; }

    /// <summary>Whether it left the job order list of the machine.</summary>
    public bool Removed { get; init; }

    /// <summary>Name of the job order.</summary>
    public string? JobName { get; init; }

    /// <summary>The work master it carries out on this machine.</summary>
    public string? WorkMasterId { get; init; }

    /// <summary>Order numbers of the ERP.</summary>
    public IReadOnlyList<string>? OrderNumbers { get; init; }

    /// <summary>Runs planned.</summary>
    public long? RunsPlanned { get; init; }

    /// <summary>Planned start, if the machine knows it.</summary>
    public DateTime? PlannedStartTime { get; init; }

    /// <summary>Planned end, if the machine knows it.</summary>
    public DateTime? PlannedEndTime { get; init; }

    /// <summary>When it started; null before its start.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>When it ended or was aborted.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Seconds from its start to its end; null until both are known.</summary>
    public double? DurationSeconds { get; init; }

    /// <summary>
    /// Seconds from the end of the step before to the start of this one: negative when they overlap, null for the
    /// first step or when one of the two times is not known.
    /// </summary>
    public double? WaitingSecondsBefore { get; init; }

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

    /// <summary>How many program executions it had since its start.</summary>
    public int ProgramExecutions { get; init; }

    /// <summary>Duration of its ended and aborted program executions, in seconds, their interruptions included.</summary>
    public double ProgramExecutionDuration { get; init; }

    /// <summary>Parts its ended and aborted program executions produced.</summary>
    public double PartsProduced { get; init; }

    /// <summary>Electric energy of its ended and aborted program executions, in watt hours.</summary>
    public double EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of its ended and aborted program executions, in watt hours.</summary>
    public double EnergyCompressedAir { get; init; }
}
