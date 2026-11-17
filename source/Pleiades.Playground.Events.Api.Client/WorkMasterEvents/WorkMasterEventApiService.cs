// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.WorkMasterEvents;

/// <summary>Client of the work master events of the Events API, over <c>/workMasterEvents</c>.</summary>
public class WorkMasterEventApiService(HttpClient httpClient)
    : BaseEventApiService(httpClient), IWorkMasterEventService
{
    public Task<WorkMasterEventDtoV1> PostEvent(WorkMasterEventDtoV1 workMasterEvent)
        => PostAsync<WorkMasterEventDtoV1>("workMasterEvents", workMasterEvent);

    public Task PostEvents(IEnumerable<WorkMasterEventDtoV1> workMasterEvents, CancellationToken cancellationToken)
        => PostAsync("workMasterEvents/bulk", workMasterEvents, cancellationToken);
}
