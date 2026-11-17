// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Serialization;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// An event of production: a job order or a program execution reached a state, or changed. Every event carries
/// the whole state after it, so the last event of a <see cref="CorrelationId"/> is the current state, and one event
/// alone can be read. Published on <c>machines/{MId}/events/production</c> with the MQTT 5 content type
/// <c>productioneventdtov1</c>; numbers in SI units, energy in joule.
/// </summary>
public sealed record ProductionEventDtoV1 : IMachineEvent
{
    /// <summary>When the event happened, source time in UTC.</summary>
    public DateTime Timestamp { get; set; }

    /// <summary>Id of the event, unique; a delivery that repeats it repeats the id.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Machine id, the serial number of the machine.</summary>
    public string MId { get; set; } = string.Empty;

    /// <summary>What the event is about: a job order or a program execution.</summary>
    public ProductionSubject Subject { get; set; }

    /// <summary>What happened, named after the state reached.</summary>
    public ProductionAction Action { get; set; }

    /// <summary>The key that links the events of one job order or program execution: <see cref="JobOrderId"/> for a
    /// job order, <see cref="ExecutionId"/> for a program execution.</summary>
    public string CorrelationId { get; set; } = string.Empty;

    /// <summary>The job order; for a program execution the job order it belongs to, if any.</summary>
    public string? JobOrderId { get; set; }

    /// <summary>The program execution; only for a program execution.</summary>
    public string? ExecutionId { get; set; }

    /// <summary>The work master (the program) that runs or ran.</summary>
    public string? WorkMaster { get; set; }

    /// <summary>The state after the event: NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended or Aborted
    /// for a job order; Running, Interrupted, Ended or Aborted for a program execution.</summary>
    public string State { get; set; } = string.Empty;

    /// <summary>When the job order or program execution started.</summary>
    public DateTime? StartTime { get; set; }

    /// <summary>When the job order ended or was aborted.</summary>
    public DateTime? EndTime { get; set; }

    /// <summary>Parts the job order has produced, good ones and scrap; from its start on.</summary>
    public double? ProducedQuantity { get; set; }

    /// <summary>Of those, the parts that meet the quality requirements.</summary>
    public double? GoodQuantity { get; set; }

    /// <summary>Duration of the program execution in seconds, its interruptions included; at its end.</summary>
    public double? Duration { get; set; }

    /// <summary>Parts the program execution produced; at its end.</summary>
    public double? PartsProduced { get; set; }

    /// <summary>Electric energy the program execution took, in joule; at its end.</summary>
    public double? EnergyElectricity { get; set; }

    /// <summary>Energy of compressed air the program execution took, in joule; at its end.</summary>
    public double? EnergyCompressedAir { get; set; }

    /// <summary>Optional number of the production events of a machine, counting up without a gap, so that a gap
    /// shows; it may start again from 1 when the source restarts.</summary>
    public long? Seq { get; set; }
}

/// <summary>What a production event is about.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProductionSubject
{
    JobOrder,
    ProgramExecution,
}

/// <summary>What happened, named after the state reached. A program execution knows Started, Interrupted, Resumed,
/// Ended and Aborted; a job order all of them.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProductionAction
{
    Added,
    Released,
    Revoked,
    Started,
    Interrupted,
    Resumed,
    Ended,
    Aborted,
    Cancelled,
    Changed,
    Removed,
}
