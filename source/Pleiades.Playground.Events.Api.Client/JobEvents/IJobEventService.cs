// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.JobEvents;

/// <summary>Client of the job events of the Events API.</summary>
public interface IJobEventService
{
    /// <summary>Posts one job event.</summary>
    Task<JobEventDtoV1> PostEvent(JobEventDtoV1 jobEvent);

    /// <summary>Posts several job events in bulk.</summary>
    Task PostEvents(IEnumerable<JobEventDtoV1> jobEvents, CancellationToken cancellationToken);
}
