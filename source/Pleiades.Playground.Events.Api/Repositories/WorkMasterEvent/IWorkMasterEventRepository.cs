// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;

/// <summary>
/// Repository of work master events: they are written as they come, and read as events or as the material the views
/// (program executions) are put together from.
/// </summary>
internal interface IWorkMasterEventRepository
{
    /// <summary>The most events one read for a view takes; older ones beyond it are left out.</summary>
    public const int MaxEventsForViews = 100_000;

    /// <summary>Creates a single event.</summary>
    Task CreateAsync(WorkMasterEventDao dao, CancellationToken cancellationToken);

    /// <summary>Creates several events (unordered bulk insert).</summary>
    Task CreateManyAsync(IEnumerable<WorkMasterEventDao> events, CancellationToken cancellationToken);

    /// <summary>A page of events, filtered, sorted by time.</summary>
    Task<(List<WorkMasterEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        WorkMasterEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    /// <summary>
    /// The events a view is put together from, oldest first, at most <see cref="MaxEventsForViews"/> (the newest of
    /// them).
    /// </summary>
    Task<List<WorkMasterEventDao>> FindForViewAsync(WorkMasterEventFilter filter, CancellationToken cancellationToken);
}

/// <summary>Filter on work master events; every part that is null filters nothing.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="Action">What happened.</param>
/// <param name="JobOrderId">The job order.</param>
/// <param name="WorkMasterId">The work master.</param>
/// <param name="From">Earliest time of the event, inclusive.</param>
/// <param name="To">Latest time of the event, inclusive.</param>
internal sealed record WorkMasterEventFilter(
    string? MId = null,
    WorkMasterAction? Action = null,
    string? JobOrderId = null,
    string? WorkMasterId = null,
    DateTime? From = null,
    DateTime? To = null);
