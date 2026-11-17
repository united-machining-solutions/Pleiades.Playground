// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Serialization;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// An event of a program execution: the machine started, interrupted, resumed, ended or aborted carrying out a work
/// master. Every event carries the whole program execution after it; Ended and Aborted carry its sums. Published on
/// <c>machines/{MId}/events/workmasters</c> with the MQTT 5 content type <c>workmastereventdtov1</c>; numbers in SI
/// units, energy in joule.
/// </summary>
public sealed record WorkMasterEventDtoV1 : IMachineEvent
{
    /// <summary>When the event happened, source time in UTC.</summary>
    public DateTime Timestamp { get; set; }

    /// <summary>Id of the event, unique; a delivery that repeats it repeats the id.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Machine id, the serial number of the machine.</summary>
    public string MId { get; set; } = string.Empty;

    /// <summary>What happened, named after the state reached.</summary>
    public WorkMasterAction Action { get; set; }

    /// <summary>The key that links the events of one program execution: its <see cref="ExecutionId"/>.</summary>
    public string CorrelationId { get; set; } = string.Empty;

    /// <summary>The program execution.</summary>
    public string ExecutionId { get; set; } = string.Empty;

    /// <summary>The work master carried out.</summary>
    public string? WorkMasterId { get; set; }

    /// <summary>The job order the program execution belongs to, if any.</summary>
    public string? JobOrderId { get; set; }

    /// <summary>The state after the event: Running, Interrupted, Ended or Aborted.</summary>
    public string State { get; set; } = string.Empty;

    /// <summary>When the program execution started; it stays after an interruption.</summary>
    public DateTime StartTime { get; set; }

    /// <summary>Duration in seconds, its interruptions included; at its end.</summary>
    public double? Duration { get; set; }

    /// <summary>Parts produced; at its end.</summary>
    public double? PartsProduced { get; set; }

    /// <summary>Electric energy taken, in joule; at its end.</summary>
    public double? EnergyElectricity { get; set; }

    /// <summary>Energy of compressed air taken, in joule; at its end.</summary>
    public double? EnergyCompressedAir { get; set; }

    /// <summary>Optional number of the work master events of a machine, counting up without a gap, so that a gap
    /// shows; it may start again from 1 when the source restarts.</summary>
    public long? Seq { get; set; }
}

/// <summary>What happened to a program execution, named after the state reached.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum WorkMasterAction
{
    Started,
    Interrupted,
    Resumed,
    Ended,
    Aborted,
}
