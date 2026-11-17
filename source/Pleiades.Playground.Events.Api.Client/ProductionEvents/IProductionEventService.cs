// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.ProductionEvents;

/// <summary>Client of the production events of the Events API.</summary>
public interface IProductionEventService
{
    /// <summary>Posts one production event.</summary>
    Task<ProductionEventDtoV1> PostEvent(ProductionEventDtoV1 productionEvent);

    /// <summary>Posts several production events in bulk.</summary>
    Task PostEvents(IEnumerable<ProductionEventDtoV1> productionEvents, CancellationToken cancellationToken);
}
