// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using MongoDB.Driver;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Repositories.MachineEvent;

/// <summary>
/// Repository of the CloudEvents of machines: they are stored as they come, and read as events or as the material
/// the views (alerts, job orders, program executions, gaps) are put together from.
/// </summary>
internal interface IMachineEventRepository
{
    /// <summary>The most events one read for a view takes; older ones beyond it are left out.</summary>
    public const int MaxEventsForViews = 100_000;

    /// <summary>Stores one event; a repeated one is a <see cref="PleiadesDuplicateDataException"/>.</summary>
    Task CreateAsync(MachineEventDao dao, CancellationToken cancellationToken);

    /// <summary>
    /// Stores several events (unordered); a repeated one is skipped and named in a
    /// <see cref="PleiadesDuplicateDataException"/> after the others are stored.
    /// </summary>
    Task CreateManyAsync(IEnumerable<MachineEventDao> events, CancellationToken cancellationToken);

    /// <summary>A page of events, filtered, sorted by time.</summary>
    Task<(List<MachineEventDao> Items, long TotalCount)> QueryAsync(
        MachineEventFilter filter, int skip, int take, Sorting sorting, CancellationToken cancellationToken);

    /// <summary>The events a view is put together from, oldest first, at most <see cref="MaxEventsForViews"/> (the newest).</summary>
    Task<List<MachineEventDao>> FindForViewAsync(MachineEventFilter filter, CancellationToken cancellationToken);
}

/// <summary>Filter on the events of machines; every part that is null filters nothing.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="Group">Group of events: JobMonitoring, WorkMasterMonitoring or Notification.</param>
/// <param name="Type">Type of the CloudEvent.</param>
/// <param name="CorrelationId">The correlationid attribute.</param>
/// <param name="JobOrderId">The field JobOrderID of the data.</param>
/// <param name="From">Earliest time of the event, inclusive.</param>
/// <param name="To">Latest time of the event, inclusive.</param>
internal sealed record MachineEventFilter(
    string? MId = null,
    string? Group = null,
    string? Type = null,
    string? CorrelationId = null,
    string? JobOrderId = null,
    DateTime? From = null,
    DateTime? To = null);

/// <summary>Repository of the events of machines in MongoDB.</summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated via DI")]
internal sealed class MachineEventRepository(IEventsDbContext dbContext) : IMachineEventRepository
{
    /// <inheritdoc />
    public async Task CreateAsync(MachineEventDao dao, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.MachineEvents.InsertOneAsync(dao, cancellationToken: cancellationToken).ConfigureAwait(false);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PleiadesDuplicateDataException($"The event {dao.Key} is already stored.", innerException: ex);
        }
    }

    /// <inheritdoc />
    public async Task CreateManyAsync(IEnumerable<MachineEventDao> events, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.MachineEvents
                .InsertManyAsync(events, new InsertManyOptions { IsOrdered = false }, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoBulkWriteException ex) when (ex.WriteErrors.All(e => e.Category == ServerErrorCategory.DuplicateKey))
        {
            throw new PleiadesDuplicateDataException($"{ex.WriteErrors.Count} of the events are already stored.", ex);
        }
    }

    /// <inheritdoc />
    public async Task<(List<MachineEventDao> Items, long TotalCount)> QueryAsync(
        MachineEventFilter filter, int skip, int take, Sorting sorting, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var definition = Build(filter);
        var countTask = dbContext.MachineEvents.CountDocumentsAsync(definition, cancellationToken: cancellationToken);
        var find = dbContext.MachineEvents.Find(definition);
        find = sorting == Sorting.Ascending ? find.SortBy(e => e.Time) : find.SortByDescending(e => e.Time);
        var itemsTask = find.Skip(skip).Limit(take).ToListAsync(cancellationToken);

        await Task.WhenAll(countTask, itemsTask).ConfigureAwait(false);
        return (await itemsTask.ConfigureAwait(false), await countTask.ConfigureAwait(false));
    }

    /// <inheritdoc />
    public async Task<List<MachineEventDao>> FindForViewAsync(MachineEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var newestFirst = await dbContext.MachineEvents
            .Find(Build(filter))
            .SortByDescending(e => e.Time)
            .Limit(IMachineEventRepository.MaxEventsForViews)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        newestFirst.Reverse();
        return newestFirst;
    }

    private static FilterDefinition<MachineEventDao> Build(MachineEventFilter filter)
    {
        var builder = Builders<MachineEventDao>.Filter;
        var parts = new List<FilterDefinition<MachineEventDao>>();

        if (!string.IsNullOrEmpty(filter.MId))
        {
            parts.Add(builder.Eq(e => e.MId, filter.MId));
        }
        if (!string.IsNullOrEmpty(filter.Group))
        {
            parts.Add(builder.Eq(e => e.Group, filter.Group));
        }
        if (!string.IsNullOrEmpty(filter.Type))
        {
            parts.Add(builder.Eq(e => e.Type, filter.Type));
        }
        if (!string.IsNullOrEmpty(filter.CorrelationId))
        {
            parts.Add(builder.Eq(e => e.CorrelationId, filter.CorrelationId));
        }
        if (!string.IsNullOrEmpty(filter.JobOrderId))
        {
            parts.Add(builder.Eq("Data.JobOrderID", filter.JobOrderId));
        }
        if (filter.From.HasValue)
        {
            parts.Add(builder.Gte(e => e.Time, filter.From.Value));
        }
        if (filter.To.HasValue)
        {
            parts.Add(builder.Lte(e => e.Time, filter.To.Value));
        }

        return parts.Count > 0 ? builder.And(parts) : builder.Empty;
    }
}
