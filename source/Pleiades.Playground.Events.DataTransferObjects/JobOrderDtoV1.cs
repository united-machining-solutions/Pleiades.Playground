// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// The last known state of one job order, put together from its production events when it is read: the state,
/// times and quantities of its last event, and what its program executions add up to.
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
    public ProductionAction LastAction { get; init; }

    /// <summary>When its last event happened.</summary>
    public DateTime LastChange { get; init; }

    /// <summary>When it was first seen.</summary>
    public DateTime FirstSeen { get; init; }

    /// <summary>Whether it left the job order list of the machine (its last event is Removed).</summary>
    public bool Removed { get; init; }

    /// <summary>The work master (the program) of its program executions, if known.</summary>
    public string? WorkMaster { get; init; }

    /// <summary>When it started.</summary>
    public DateTime? StartTime { get; init; }

    /// <summary>When it ended or was aborted.</summary>
    public DateTime? EndTime { get; init; }

    /// <summary>Parts produced, good ones and scrap.</summary>
    public double? ProducedQuantity { get; init; }

    /// <summary>Of those, the good ones.</summary>
    public double? GoodQuantity { get; init; }

    /// <summary>How many program executions it had.</summary>
    public int ProgramExecutions { get; init; }

    /// <summary>Electric energy of its ended and aborted program executions, in joule.</summary>
    public double EnergyElectricity { get; init; }

    /// <summary>Energy of compressed air of its ended and aborted program executions, in joule.</summary>
    public double EnergyCompressedAir { get; init; }
}

/// <summary>A job order with the events it went through, oldest first.</summary>
public sealed record JobOrderHistoryDtoV1
{
    /// <summary>The last known state of the job order.</summary>
    public required JobOrderDtoV1 JobOrder { get; init; }

    /// <summary>Its events and those of its program executions, oldest first.</summary>
    public required IReadOnlyList<ProductionEventDtoV1> History { get; init; }
}
