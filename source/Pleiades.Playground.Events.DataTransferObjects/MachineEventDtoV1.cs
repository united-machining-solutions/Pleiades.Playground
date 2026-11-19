// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;

namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// A CloudEvent of a machine as the Events API stored it: unchanged, with the machine id of the topic it came on.
/// The attributes of the CloudEvent stand beside <see cref="Data"/>, the flat struct of the event of the data model.
/// </summary>
public sealed record MachineEventDtoV1
{
    /// <summary>The machine id, the second level of the topic: <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>.</summary>
    public required string MId { get; init; }

    /// <summary>The group of the event, the first segment of its type: JobMonitoring, WorkMasterMonitoring or Notification.</summary>
    public required string Group { get; init; }

    /// <summary>The type of the CloudEvent, the path of the event in the data model, such as <c>Notification.AlertRaised</c>.</summary>
    public required string Type { get; init; }

    /// <summary>The id of the CloudEvent; with <see cref="Source"/> it names the event once.</summary>
    public required string Id { get; init; }

    /// <summary>The source of the CloudEvent, the ProductInstanceUri of the machine.</summary>
    public required string Source { get; init; }

    /// <summary>When the event happened, source time in UTC.</summary>
    public DateTime Time { get; init; }

    /// <summary>The number of the event within its group: the start of the adapter, a dot and a count.</summary>
    public string? Sequence { get; init; }

    /// <summary>The ExecutionId of the program execution the event belongs to, if any.</summary>
    public string? CorrelationId { get; init; }

    /// <summary>The flat struct of the event, as the machine sent it (units of the data model).</summary>
    public JsonElement Data { get; init; }

    /// <summary>When the Events API stored the event.</summary>
    public DateTime ReceivedAt { get; init; }
}

/// <summary>A CloudEvent to store, with the machine id of the topic it came on.</summary>
public sealed record MachineEventInputDtoV1
{
    /// <summary>The machine id, the second level of the topic.</summary>
    public required string MId { get; init; }

    /// <summary>The CloudEvent 1.0 in the JSON format, structured mode, as it came.</summary>
    public required JsonElement CloudEvent { get; init; }
}

/// <summary>
/// A gap in the numbers of the events of one group of a machine within one run of its adapter: the counts that
/// never arrived between two that did.
/// </summary>
public sealed record SequenceGapDtoV1
{
    /// <summary>The machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The group of events.</summary>
    public required string Group { get; init; }

    /// <summary>The run of the adapter: the prefix of <c>sequence</c>, the time it started.</summary>
    public required string Prefix { get; init; }

    /// <summary>The first count that is missing.</summary>
    public long FirstMissing { get; init; }

    /// <summary>The last count that is missing.</summary>
    public long LastMissing { get; init; }

    /// <summary>How many events are missing.</summary>
    public long Missing { get; init; }
}
