// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// An alert of a machine as its events tell it: raised, maybe changed, maybe cleared. The fields are those of the
/// alert of the data model; the severity is the category after NAMUR NE 107.
/// </summary>
public record AlertDtoV1
{
    /// <summary>The machine id.</summary>
    public required string MId { get; init; }

    /// <summary>The id of the alert, the same in its raise, change and clear.</summary>
    public required string AlertId { get; init; }

    /// <summary>The code of the manufacturer.</summary>
    public string? ErrorCode { get; init; }

    /// <summary>The text for the operator.</summary>
    public string? Message { get; init; }

    /// <summary>Failure, CheckFunction, OffSpec or MaintenanceRequired (NAMUR NE 107).</summary>
    public string? Severity { get; init; }

    /// <summary>The urgency from 1 to 1000, if the machine names one.</summary>
    public int? SeverityValue { get; init; }

    /// <summary>The component concerned, if the machine names one.</summary>
    public string? SourceName { get; init; }

    /// <summary>The ExecutionId of the program execution the alert came up in, if any.</summary>
    public string? CorrelationId { get; init; }

    /// <summary>When the alert came up.</summary>
    public DateTime RaisedAt { get; init; }

    /// <summary>When its last event happened.</summary>
    public DateTime LastChange { get; init; }
}

/// <summary>An alert from its raise to its clear; <see cref="ClearedAt"/> is null while it stands.</summary>
public sealed record AlertPairDtoV1 : AlertDtoV1
{
    /// <summary>When the alert was cleared; null while it stands.</summary>
    public DateTime? ClearedAt { get; init; }

    /// <summary>How long it stood, in seconds; null while it stands.</summary>
    public double? DurationSeconds { get; init; }
}

/// <summary>The alerts of one severity in a time range.</summary>
public sealed record AlertStatisticDtoV1
{
    /// <summary>Failure, CheckFunction, OffSpec or MaintenanceRequired.</summary>
    public required string Severity { get; init; }

    /// <summary>How many alerts of the severity stood in the range.</summary>
    public int Raised { get; init; }

    /// <summary>How many of them still stand.</summary>
    public int Active { get; init; }

    /// <summary>How long the cleared ones stood together, in seconds.</summary>
    public double TotalDurationSeconds { get; init; }
}
