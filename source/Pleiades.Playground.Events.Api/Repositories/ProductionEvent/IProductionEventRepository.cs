// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Repositories.ProductionEvent;

/// <summary>
/// Repository of production events: they are written as they come, and read as events or as the material the
/// views (program executions, job orders) are put together from.
/// </summary>
internal interface IProductionEventRepository
{
    /// <summary>The most events one read for a view takes; older ones beyond it are left out.</summary>
    public const int MaxEventsForViews = 100_000;

    /// <summary>Creates a single production event.</summary>
    Task CreateAsync(ProductionEventDao dao, CancellationToken cancellationToken);

    /// <summary>Creates several production events (unordered bulk insert).</summary>
    Task CreateManyAsync(IEnumerable<ProductionEventDao> events, CancellationToken cancellationToken);

    /// <summary>A page of production events, filtered, sorted by time.</summary>
    Task<(List<ProductionEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        ProductionEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    /// <summary>
    /// The production events a view is put together from, oldest first, at most <see cref="MaxEventsForViews"/>
    /// (the newest of them).
    /// </summary>
    Task<List<ProductionEventDao>> FindForViewAsync(ProductionEventFilter filter, CancellationToken cancellationToken);
}

/// <summary>Filter on production events; every part that is null filters nothing.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="Subject">Job order or program execution.</param>
/// <param name="Action">What happened.</param>
/// <param name="JobOrderId">The job order: its own events and those of its program executions.</param>
/// <param name="From">Earliest time of the event, inclusive.</param>
/// <param name="To">Latest time of the event, inclusive.</param>
internal sealed record ProductionEventFilter(
    string? MId = null,
    ProductionSubject? Subject = null,
    ProductionAction? Action = null,
    string? JobOrderId = null,
    DateTime? From = null,
    DateTime? To = null);
