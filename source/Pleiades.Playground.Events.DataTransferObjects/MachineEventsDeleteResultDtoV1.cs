// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// Result of deleting the events of a machine.
/// </summary>
public sealed record MachineEventsDeleteResultDtoV1
{
    /// <summary>
    /// Number of events deleted.
    /// </summary>
    public long EventsCount { get; init; }
}
