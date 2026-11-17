// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Projections;

namespace Pleiades.Playground.Events.Api.Repositories.MachineEvent;

/// <summary>
/// Repository of the CloudEvents of machines: they are stored as they come, and read as events or as the material
/// the views (alerts, job orders, program executions, gaps) are put together from.
/// </summary>
internal interface IMachineEventRepository
{
    /// <summary>The most events one read for a view takes; older ones beyond it are left out, and the read says so.</summary>
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

    /// <summary>
    /// The events a view is put together from, oldest first, at most <see cref="MaxEventsForViews"/> (the newest),
    /// without the CloudEvent as it came (<see cref="MachineEventDao.Event"/>), which no view reads.
    /// </summary>
    Task<ViewEvents> FindForViewAsync(MachineEventFilter filter, CancellationToken cancellationToken);

    /// <summary>
    /// The runs of the adapters: per machine, group and prefix of <c>sequence</c>, the first and the last count seen,
    /// how many events there are and the times of the first and the last. Every event that matches the filter counts.
    /// </summary>
    Task<List<SequenceRun>> FindRunsAsync(MachineEventFilter filter, CancellationToken cancellationToken);

    /// <summary>The counts of <c>sequence</c> of one run that match the filter, in any order.</summary>
    Task<List<long>> FindCountsAsync(MachineEventFilter filter, string prefix, CancellationToken cancellationToken);

    /// <summary>
    /// Every event of the alerts whose last event is not <c>AlertCleared</c>: the material of the active alerts, with
    /// no limit, because only the alerts that stand are read.
    /// </summary>
    Task<List<MachineEventDao>> FindOpenAlertEventsAsync(string? mId, CancellationToken cancellationToken);
}

/// <summary>The events of a view and whether older ones were left out.</summary>
/// <param name="Items">The events, oldest first.</param>
/// <param name="Truncated">True when <see cref="IMachineEventRepository.MaxEventsForViews"/> left older events out.</param>
internal sealed record ViewEvents(List<MachineEventDao> Items, bool Truncated);

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
internal sealed class MachineEventRepository(IEventsDbContext dbContext, ILogger<MachineEventRepository> logger) : IMachineEventRepository
{
    private static readonly Action<ILogger, int, string, Exception?> LogTruncated =
        LoggerMessage.Define<int, string>(LogLevel.Warning, new EventId(20, "ViewTruncated"),
            "A view read only the newest {Max} events of {Filter}; older ones are left out");

    private static readonly string[] AlertTypes = [MachineEventViews.AlertRaised, MachineEventViews.AlertChanged, MachineEventViews.AlertCleared];

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
    public async Task<ViewEvents> FindForViewAsync(MachineEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        // One more than the limit tells whether the limit left events out.
        var newestFirst = await dbContext.MachineEvents
            .Find(Build(filter))
            .Project<MachineEventDao>(Builders<MachineEventDao>.Projection.Exclude(e => e.Event))
            .SortByDescending(e => e.Time)
            .Limit(IMachineEventRepository.MaxEventsForViews + 1)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var truncated = newestFirst.Count > IMachineEventRepository.MaxEventsForViews;
        if (truncated)
        {
            newestFirst.RemoveAt(newestFirst.Count - 1);
            LogTruncated(logger, IMachineEventRepository.MaxEventsForViews, filter.ToString(), null);
        }
        newestFirst.Reverse();
        return new ViewEvents(newestFirst, truncated);
    }

    /// <inheritdoc />
    public async Task<List<SequenceRun>> FindRunsAsync(MachineEventFilter filter, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var builder = Builders<MachineEventDao>.Filter;
        var match = builder.And(Build(filter), builder.Ne(e => e.SequencePrefix, null), builder.Ne(e => e.SequenceCount, null));
        var group = new BsonDocument
        {
            ["_id"] = new BsonDocument { ["m"] = "$MId", ["g"] = "$Group", ["p"] = "$SequencePrefix" },
            ["first"] = new BsonDocument("$min", "$SequenceCount"),
            ["last"] = new BsonDocument("$max", "$SequenceCount"),
            ["n"] = new BsonDocument("$sum", 1),
            ["firstTime"] = new BsonDocument("$min", "$Time"),
            ["lastTime"] = new BsonDocument("$max", "$Time"),
        };
        var rows = await dbContext.MachineEvents.Aggregate(new AggregateOptions { AllowDiskUse = true })
            .Match(match)
            .Group(group)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return [.. rows.Select(row =>
        {
            var id = row["_id"].AsBsonDocument;
            return new SequenceRun(
                id["m"].AsString, id["g"].AsString, id["p"].AsString,
                row["first"].ToInt64(), row["last"].ToInt64(), row["n"].ToInt64(),
                row["firstTime"].ToUniversalTime(), row["lastTime"].ToUniversalTime());
        })];
    }

    /// <inheritdoc />
    public async Task<List<long>> FindCountsAsync(MachineEventFilter filter, string prefix, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var builder = Builders<MachineEventDao>.Filter;
        var counts = await dbContext.MachineEvents
            .Find(builder.And(Build(filter), builder.Eq(e => e.SequencePrefix, prefix), builder.Ne(e => e.SequenceCount, null)))
            .Project(e => e.SequenceCount)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return [.. counts.Select(c => c!.Value)];
    }

    /// <inheritdoc />
    public async Task<List<MachineEventDao>> FindOpenAlertEventsAsync(string? mId, CancellationToken cancellationToken)
    {
        var builder = Builders<MachineEventDao>.Filter;
        var alertEvents = builder.And(
            Build(new MachineEventFilter(mId, "Notification")),
            builder.In(e => e.Type, AlertTypes),
            builder.Type("Data.Id", BsonType.String));

        // The last event of each alert, by time and then by sequence as the views order them; only those not cleared.
        var open = await dbContext.MachineEvents.Aggregate(new AggregateOptions { AllowDiskUse = true })
            .Match(alertEvents)
            .Sort(Builders<MachineEventDao>.Sort.Ascending(e => e.Time).Ascending(e => e.Sequence))
            .Group(new BsonDocument
            {
                ["_id"] = new BsonDocument { ["m"] = "$MId", ["id"] = "$Data.Id" },
                ["lastType"] = new BsonDocument("$last", "$Type"),
            })
            .Match(new BsonDocument("lastType", new BsonDocument("$ne", MachineEventViews.AlertCleared)))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (open.Count == 0)
        {
            return [];
        }

        var keys = open.Select(row => (MId: row["_id"]["m"].AsString, Id: row["_id"]["id"].AsString)).ToHashSet();
        var events = await dbContext.MachineEvents
            .Find(builder.And(
                alertEvents,
                builder.In(e => e.MId, keys.Select(k => k.MId).Distinct()),
                builder.In("Data.Id", keys.Select(k => k.Id).Distinct())))
            .Project<MachineEventDao>(Builders<MachineEventDao>.Projection.Exclude(e => e.Event))
            .SortBy(e => e.Time)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return [.. events.Where(e => keys.Contains((e.MId, e.Data["Id"].AsString)))];
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
