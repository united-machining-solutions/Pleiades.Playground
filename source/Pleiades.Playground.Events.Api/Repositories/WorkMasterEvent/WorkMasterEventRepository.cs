// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using MongoDB.Driver;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;

/// <summary>Repository of work master events in MongoDB.</summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated via DI")]
internal sealed class WorkMasterEventRepository(IEventsDbContext dbContext) : IWorkMasterEventRepository
{
    /// <inheritdoc />
    public async Task CreateAsync(WorkMasterEventDao dao, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.WorkMasterEvents
                .InsertOneAsync(dao, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PleiadesDuplicateDataException(ex.Message, innerException: ex);
        }
    }

    /// <inheritdoc />
    public async Task CreateManyAsync(IEnumerable<WorkMasterEventDao> events, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.WorkMasterEvents
                .InsertManyAsync(events, new InsertManyOptions { IsOrdered = false }, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoBulkWriteException ex)
        {
            if (ex.WriteErrors.Any(e => e.Category == ServerErrorCategory.DuplicateKey))
            {
                throw new PleiadesDuplicateDataException("Some work master events already exist.", ex);
            }

            throw;
        }
    }

    /// <inheritdoc />
    public async Task<(List<WorkMasterEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        WorkMasterEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var definition = Build(filter);
        var countTask = dbContext.WorkMasterEvents.CountDocumentsAsync(definition, cancellationToken: cancellationToken);

        var find = dbContext.WorkMasterEvents.Find(definition);
        find = sorting == Sorting.Ascending ? find.SortBy(e => e.Timestamp) : find.SortByDescending(e => e.Timestamp);
        var itemsTask = find.Skip(skip).Limit(take).ToListAsync(cancellationToken);

        await Task.WhenAll(countTask, itemsTask).ConfigureAwait(false);
        return (await itemsTask.ConfigureAwait(false), await countTask.ConfigureAwait(false));
    }

    /// <inheritdoc />
    public async Task<List<WorkMasterEventDao>> FindForViewAsync(WorkMasterEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var newestFirst = await dbContext.WorkMasterEvents
            .Find(Build(filter))
            .SortByDescending(e => e.Timestamp)
            .Limit(IWorkMasterEventRepository.MaxEventsForViews)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        newestFirst.Reverse();
        return newestFirst;
    }

    private static FilterDefinition<WorkMasterEventDao> Build(WorkMasterEventFilter filter)
    {
        var builder = Builders<WorkMasterEventDao>.Filter;
        var parts = new List<FilterDefinition<WorkMasterEventDao>>();

        if (!string.IsNullOrEmpty(filter.MId))
        {
            parts.Add(builder.Eq(e => e.MId, filter.MId));
        }
        if (filter.Action.HasValue)
        {
            parts.Add(builder.Eq(e => e.Action, filter.Action.Value));
        }
        if (!string.IsNullOrEmpty(filter.JobOrderId))
        {
            parts.Add(builder.Eq(e => e.JobOrderId, filter.JobOrderId));
        }
        if (!string.IsNullOrEmpty(filter.WorkMasterId))
        {
            parts.Add(builder.Eq(e => e.WorkMasterId, filter.WorkMasterId));
        }
        if (filter.From.HasValue)
        {
            parts.Add(builder.Gte(e => e.Timestamp, filter.From.Value));
        }
        if (filter.To.HasValue)
        {
            parts.Add(builder.Lte(e => e.Timestamp, filter.To.Value));
        }

        return parts.Count > 0 ? builder.And(parts) : builder.Empty;
    }
}
