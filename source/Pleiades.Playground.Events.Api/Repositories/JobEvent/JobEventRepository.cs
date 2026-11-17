// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using MongoDB.Driver;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Repositories.JobEvent;

/// <summary>Repository of job events in MongoDB.</summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated via DI")]
internal sealed class JobEventRepository(IEventsDbContext dbContext) : IJobEventRepository
{
    /// <inheritdoc />
    public async Task CreateAsync(JobEventDao dao, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.JobEvents
                .InsertOneAsync(dao, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PleiadesDuplicateDataException(ex.Message, innerException: ex);
        }
    }

    /// <inheritdoc />
    public async Task CreateManyAsync(IEnumerable<JobEventDao> events, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.JobEvents
                .InsertManyAsync(events, new InsertManyOptions { IsOrdered = false }, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoBulkWriteException ex)
        {
            if (ex.WriteErrors.Any(e => e.Category == ServerErrorCategory.DuplicateKey))
            {
                throw new PleiadesDuplicateDataException("Some job events already exist.", ex);
            }

            throw;
        }
    }

    /// <inheritdoc />
    public async Task<(List<JobEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        JobEventFilter filter,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var definition = Build(filter);
        var countTask = dbContext.JobEvents.CountDocumentsAsync(definition, cancellationToken: cancellationToken);

        var find = dbContext.JobEvents.Find(definition);
        find = sorting == Sorting.Ascending ? find.SortBy(e => e.Timestamp) : find.SortByDescending(e => e.Timestamp);
        var itemsTask = find.Skip(skip).Limit(take).ToListAsync(cancellationToken);

        await Task.WhenAll(countTask, itemsTask).ConfigureAwait(false);
        return (await itemsTask.ConfigureAwait(false), await countTask.ConfigureAwait(false));
    }

    /// <inheritdoc />
    public async Task<List<JobEventDao>> FindForViewAsync(JobEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var newestFirst = await dbContext.JobEvents
            .Find(Build(filter))
            .SortByDescending(e => e.Timestamp)
            .Limit(IJobEventRepository.MaxEventsForViews)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        newestFirst.Reverse();
        return newestFirst;
    }

    private static FilterDefinition<JobEventDao> Build(JobEventFilter filter)
    {
        var builder = Builders<JobEventDao>.Filter;
        var parts = new List<FilterDefinition<JobEventDao>>();

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
