// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.WorkMasterEvents;

/// <summary>Client of the work master events of the Events API.</summary>
public interface IWorkMasterEventService
{
    /// <summary>Posts one work master event.</summary>
    Task<WorkMasterEventDtoV1> PostEvent(WorkMasterEventDtoV1 workMasterEvent);

    /// <summary>Posts several work master events in bulk.</summary>
    Task PostEvents(IEnumerable<WorkMasterEventDtoV1> workMasterEvents, CancellationToken cancellationToken);
}
