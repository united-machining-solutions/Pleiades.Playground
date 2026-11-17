// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// One program execution from its start to its end: its Started event paired with its Ended or Aborted event by
/// the <see cref="ExecutionId"/>, with the sums its end carries. A program execution without an end is still
/// running or interrupted.
/// </summary>
public sealed record ProgramExecutionPairDtoV1
{
    /// <summary>The program execution, the correlation id of its events.</summary>
    public required string ExecutionId { get; init; }

    /// <summary>Machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The job order it belongs to, if any.</summary>
    public string? JobOrderId { get; init; }

    /// <summary>The work master (the program) it ran.</summary>
    public string? WorkMaster { get; init; }

    /// <summary>Its state after its last event: Running, Interrupted, Ended or Aborted.</summary>
    public required string State { get; init; }

    /// <summary>When it started.</summary>
    public DateTime StartTime { get; init; }

    /// <summary>When it ended or was aborted; null while it runs.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>How it ended: Ended or Aborted; null while it runs.</summary>
    public ProductionAction? EndAction { get; init; }

    /// <summary>How often it was interrupted.</summary>
    public int Interruptions { get; init; }

    /// <summary>Duration in seconds, its interruptions included; at its end.</summary>
    public double? Duration { get; init; }

    /// <summary>Parts produced; at its end.</summary>
    public double? PartsProduced { get; init; }

    /// <summary>Electric energy in joule; at its end.</summary>
    public double? EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air in joule; at its end.</summary>
    public double? EnergyCompressedAir { get; init; }
}
