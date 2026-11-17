// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Serialization;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// An event of a job order: it reached a state, changed, or its result changed. Every event carries the whole job
/// order after it, what is ordered and, from its start on, what came of it, so the last event of a
/// <see cref="CorrelationId"/> is the current state, and one event alone can be read. Published on
/// <c>machines/{MId}/events/jobs</c> with the MQTT 5 content type <c>jobeventdtov1</c>; numbers in SI units.
/// </summary>
public sealed record JobEventDtoV1 : IMachineEvent
{
    /// <summary>When the event happened, source time in UTC.</summary>
    public DateTime Timestamp { get; set; }

    /// <summary>Id of the event, unique; a delivery that repeats it repeats the id.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Machine id, the serial number of the machine.</summary>
    public string MId { get; set; } = string.Empty;

    /// <summary>What happened: named after the state reached, or Added, Changed, ResultChanged, Removed.</summary>
    public JobAction Action { get; set; }

    /// <summary>The key that links the events of one job order: its <see cref="JobOrderId"/>.</summary>
    public string CorrelationId { get; set; } = string.Empty;

    /// <summary>The job order, as the machine names it, such as <c>4711/01</c>.</summary>
    public string JobOrderId { get; set; } = string.Empty;

    /// <summary>The state after the event, after ISA-95: NotAllowedToStart, AllowedToStart, Running, Interrupted,
    /// Ended or Aborted.</summary>
    public string State { get; set; } = string.Empty;

    /// <summary>Name of the job order.</summary>
    public string? JobName { get; set; }

    /// <summary>The work master the job order carries out.</summary>
    public string? WorkMasterId { get; set; }

    /// <summary>Order numbers of the ERP.</summary>
    public IReadOnlyList<string>? OrderNumbers { get; set; }

    /// <summary>Runs planned; 0 for unknown or endless.</summary>
    public long? RunsPlanned { get; set; }

    /// <summary>SimulationMode, TestMode or ProductionMode.</summary>
    public string? JobExecutionMode { get; set; }

    /// <summary>Planned start; null when the machine does not know it.</summary>
    public DateTime? PlannedStartTime { get; set; }

    /// <summary>Planned end; null when the machine does not know it.</summary>
    public DateTime? PlannedEndTime { get; set; }

    /// <summary>When the job order started; null before its start, as every field of its result.</summary>
    public DateTime? StartTime { get; set; }

    /// <summary>When it ended or was aborted; null until then.</summary>
    public DateTime? EndTime { get; set; }

    /// <summary>Parts produced, good ones and scrap.</summary>
    public double? ProducedQuantity { get; set; }

    /// <summary>Of those, the parts that meet the quality requirements.</summary>
    public double? GoodQuantity { get; set; }

    /// <summary>Runs completed.</summary>
    public long? RunsCompleted { get; set; }

    /// <summary>Time it was in production, in seconds.</summary>
    public double? ActualProductionTime { get; set; }

    /// <summary>Unknown until it ends, then Successful or Unsuccessful.</summary>
    public string? JobResult { get; set; }

    /// <summary>Optional number of the job events of a machine, counting up without a gap, so that a gap shows; it
    /// may start again from 1 when the source restarts.</summary>
    public long? Seq { get; set; }
}

/// <summary>What happened to a job order: a transition named after the state reached, or a change.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum JobAction
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
    ResultChanged,
}
