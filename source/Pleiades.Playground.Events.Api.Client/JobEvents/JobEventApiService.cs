// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.JobEvents;

/// <summary>Client of the job events of the Events API, over <c>/jobEvents</c>.</summary>
public class JobEventApiService(HttpClient httpClient)
    : BaseEventApiService(httpClient), IJobEventService
{
    public Task<JobEventDtoV1> PostEvent(JobEventDtoV1 jobEvent)
        => PostAsync<JobEventDtoV1>("jobEvents", jobEvent);

    public Task PostEvents(IEnumerable<JobEventDtoV1> jobEvents, CancellationToken cancellationToken)
        => PostAsync("jobEvents/bulk", jobEvents, cancellationToken);
}
