// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Repositories.JobEvent;

/// <summary>
/// Repository of job events: they are written as they come, and read as events or as the material the views
/// (job orders) are put together from.
/// </summary>
internal interface IJobEventRepository
{
    /// <summary>The most events one read for a view takes; older ones beyond it are left out.</summary>
    public const int MaxEventsForViews = 100_000;

    /// <summary>Creates a single event.</summary>
    Task CreateAsync(JobEventDao dao, CancellationToken cancellationToken);

    /// <summary>Creates several events (unordered bulk insert).</summary>
    Task CreateManyAsync(IEnumerable<JobEventDao> events, CancellationToken cancellationToken);

    /// <summary>A page of events, filtered, sorted by time.</summary>
    Task<(List<JobEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        JobEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken);

    /// <summary>
    /// The events a view is put together from, oldest first, at most <see cref="MaxEventsForViews"/> (the newest of
    /// them).
    /// </summary>
    Task<List<JobEventDao>> FindForViewAsync(JobEventFilter filter, CancellationToken cancellationToken);
}

/// <summary>Filter on job events; every part that is null filters nothing.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="Action">What happened.</param>
/// <param name="JobOrderId">The job order.</param>
/// <param name="From">Earliest time of the event, inclusive.</param>
/// <param name="To">Latest time of the event, inclusive.</param>
internal sealed record JobEventFilter(
    string? MId = null,
    JobAction? Action = null,
    string? JobOrderId = null,
    DateTime? From = null,
    DateTime? To = null);
