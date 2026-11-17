// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.ProductionEvents;

/// <summary>Client of the production events of the Events API, over <c>/productionEvents</c>.</summary>
public class ProductionEventApiService(HttpClient httpClient)
    : BaseEventApiService(httpClient), IProductionEventService
{
    public Task<ProductionEventDtoV1> PostEvent(ProductionEventDtoV1 productionEvent)
        => PostAsync<ProductionEventDtoV1>("productionEvents", productionEvent);

    public Task PostEvents(IEnumerable<ProductionEventDtoV1> productionEvents, CancellationToken cancellationToken)
        => PostAsync("productionEvents/bulk", productionEvents, cancellationToken);
}
