// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using MongoDB.Driver;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Repositories.ProductionEvent;

/// <summary>Repository of production events in MongoDB.</summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated via DI")]
internal sealed class ProductionEventRepository(IEventsDbContext dbContext) : IProductionEventRepository
{
    /// <inheritdoc />
    public async Task CreateAsync(ProductionEventDao dao, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.ProductionEvents
                .InsertOneAsync(dao, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PleiadesDuplicateDataException(ex.Message, innerException: ex);
        }
    }

    /// <inheritdoc />
    public async Task CreateManyAsync(IEnumerable<ProductionEventDao> events, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.ProductionEvents
                .InsertManyAsync(events, new InsertManyOptions { IsOrdered = false }, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoBulkWriteException ex)
        {
            if (ex.WriteErrors.Any(e => e.Category == ServerErrorCategory.DuplicateKey))
            {
                throw new PleiadesDuplicateDataException("Some production events already exist.", ex);
            }

            throw;
        }
    }

    /// <inheritdoc />
    public async Task<(List<ProductionEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        ProductionEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var definition = Build(filter);
        var countTask = dbContext.ProductionEvents.CountDocumentsAsync(definition, cancellationToken: cancellationToken);

        var find = dbContext.ProductionEvents.Find(definition);
        find = sorting == Sorting.Ascending ? find.SortBy(e => e.Timestamp) : find.SortByDescending(e => e.Timestamp);
        var itemsTask = find.Skip(skip).Limit(take).ToListAsync(cancellationToken);

        await Task.WhenAll(countTask, itemsTask).ConfigureAwait(false);
        return (await itemsTask.ConfigureAwait(false), await countTask.ConfigureAwait(false));
    }

    /// <inheritdoc />
    public async Task<List<ProductionEventDao>> FindForViewAsync(ProductionEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var newestFirst = await dbContext.ProductionEvents
            .Find(Build(filter))
            .SortByDescending(e => e.Timestamp)
            .Limit(IProductionEventRepository.MaxEventsForViews)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        newestFirst.Reverse();
        return newestFirst;
    }

    private static FilterDefinition<ProductionEventDao> Build(ProductionEventFilter filter)
    {
        var builder = Builders<ProductionEventDao>.Filter;
        var parts = new List<FilterDefinition<ProductionEventDao>>();

        if (!string.IsNullOrEmpty(filter.MId))
        {
            parts.Add(builder.Eq(e => e.MId, filter.MId));
        }
        if (filter.Subject.HasValue)
        {
            parts.Add(builder.Eq(e => e.Subject, filter.Subject.Value));
        }
        if (filter.Action.HasValue)
        {
            parts.Add(builder.Eq(e => e.Action, filter.Action.Value));
        }
        if (!string.IsNullOrEmpty(filter.JobOrderId))
        {
            parts.Add(builder.Eq(e => e.JobOrderId, filter.JobOrderId));
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
