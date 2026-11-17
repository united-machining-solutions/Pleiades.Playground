// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.MachineEvents;

/// <summary>Client of the CloudEvents of machines of the Events API, over <c>/machineEvents</c>.</summary>
public class MachineEventApiService(HttpClient httpClient)
    : BaseEventApiService(httpClient), IMachineEventService
{
    public Task<MachineEventDtoV1> PostEvent(MachineEventInputDtoV1 machineEvent)
        => PostAsync<MachineEventDtoV1>("machineEvents", machineEvent);

    public Task PostEvents(IEnumerable<MachineEventInputDtoV1> machineEvents, CancellationToken cancellationToken)
        => PostAsync("machineEvents/bulk", machineEvents, cancellationToken);
}
