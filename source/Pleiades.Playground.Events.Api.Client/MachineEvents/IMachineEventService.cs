// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.MachineEvents;

/// <summary>Client of the CloudEvents of machines of the Events API.</summary>
public interface IMachineEventService
{
    /// <summary>Stores one CloudEvent of a machine as it came.</summary>
    Task<MachineEventDtoV1> PostEvent(MachineEventInputDtoV1 machineEvent);

    /// <summary>Stores several CloudEvents of machines as they came.</summary>
    Task PostEvents(IEnumerable<MachineEventInputDtoV1> machineEvents, CancellationToken cancellationToken);
}
