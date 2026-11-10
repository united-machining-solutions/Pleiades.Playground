using System.Diagnostics.CodeAnalysis;
using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Repositories.NotificationEvent;

/// <summary>
/// Repository implementation for notification event CRUD operations.
/// </summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated via DI")]
internal sealed class NotificationEventRepository(IEventsDbContext dbContext) : INotificationEventRepository
{
    private const string First = "$first";
    private const string CondOperator = "$cond";
    private const string ActionField = "$Action";
    private const string TimestampField = "$Timestamp";
    private const string RaisedTimestampField = "$raisedTimestamp";
    private const string ResetTimestampField = "$resetTimestamp";
    private const string DurationMsField = "durationMs";
    private const string TitleField = "title";
    private const string NotificationIdField = "notificationId";

    /// <inheritdoc />
    public async Task CreateAsync(NotificationEventDao dao, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.NotificationEvents
                .InsertOneAsync(dao, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new PleiadesDuplicateDataException(ex.Message, innerException: ex);
        }
    }

    /// <inheritdoc />
    public async Task CreateManyAsync(IEnumerable<NotificationEventDao> events, CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.NotificationEvents
                .InsertManyAsync(events, new InsertManyOptions { IsOrdered = false }, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (MongoBulkWriteException ex)
        {
            if (ex.WriteErrors.Any(e => e.Category == ServerErrorCategory.DuplicateKey))
            {
                throw new PleiadesDuplicateDataException("Some notification events already exist.", ex);
            }

            throw;
        }
    }

    /// <inheritdoc />
    public async Task<(List<NotificationEventDao> Items, long TotalCount)> QueryEventsWithPaginationAsync(
        string? mId,
        NotificationAction? action,
        string? messageId,
        EventLevel? level,
        DateTime? fromDate,
        DateTime? toDate,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        var filterBuilder = Builders<NotificationEventDao>.Filter;
        var filters = new List<FilterDefinition<NotificationEventDao>>();

        if (!string.IsNullOrEmpty(mId))
        {
            filters.Add(filterBuilder.Eq(e => e.MId, mId));
        }
        if (action.HasValue)
        {
            filters.Add(filterBuilder.Eq(e => e.Action, action.Value));
        }
        if (!string.IsNullOrEmpty(messageId))
        {
            filters.Add(filterBuilder.Eq(e => e.NotificationId, messageId));
        }
        if (level.HasValue)
        {
            filters.Add(filterBuilder.Eq(e => e.Level, level.Value));
        }
        if (fromDate.HasValue)
        {
            filters.Add(filterBuilder.Gte(e => e.Timestamp, fromDate.Value));
        }
        if (toDate.HasValue)
        {
            filters.Add(filterBuilder.Lte(e => e.Timestamp, toDate.Value));
        }

        var filter = filters.Count > 0 ? filterBuilder.And(filters) : filterBuilder.Empty;

        var countTask = dbContext.NotificationEvents.CountDocumentsAsync(filter, cancellationToken: cancellationToken);

        var findFluent = dbContext.NotificationEvents.Find(filter);

        findFluent = sorting switch
        {
            Sorting.Ascending => findFluent.SortBy(e => e.Timestamp),
            Sorting.Descending => findFluent.SortByDescending(e => e.Timestamp),
            _ => findFluent.SortByDescending(e => e.Timestamp)
        };

        var itemsTask = findFluent
            .Skip(skip)
            .Limit(take)
            .ToListAsync(cancellationToken);

        await Task.WhenAll(countTask, itemsTask).ConfigureAwait(false);

        return (await itemsTask.ConfigureAwait(false), await countTask.ConfigureAwait(false));
    }

    /// <inheritdoc />
    public async Task<(List<PairedNotificationEventDao> Items, long TotalCount)> QueryPairedEventsWithPaginationAsync(
        string? mId,
        string? messageId,
        EventLevel? level,
        DateTime? fromDate,
        DateTime? toDate,
        int skip,
        int take,
        Sorting sorting,
        CancellationToken cancellationToken)
    {
        var filterBuilder = Builders<NotificationEventDao>.Filter;
        var filters = new List<FilterDefinition<NotificationEventDao>>();

        if (!string.IsNullOrEmpty(mId))
        {
            filters.Add(filterBuilder.Eq(e => e.MId, mId));
        }
        if (!string.IsNullOrEmpty(messageId))
        {
            filters.Add(filterBuilder.Eq(e => e.NotificationId, messageId));
        }
        if (level.HasValue)
        {
            filters.Add(filterBuilder.Or(
                filterBuilder.Eq(e => e.Level, level.Value),
                filterBuilder.Eq(e => e.Action, NotificationAction.Reset)));
        }
        if (fromDate.HasValue)
        {
            filters.Add(filterBuilder.Gte(e => e.Timestamp, fromDate.Value));
        }
        if (toDate.HasValue)
        {
            filters.Add(filterBuilder.Lte(e => e.Timestamp, toDate.Value));
        }

        // Require non-empty CorrelationId for pairing
        filters.Add(filterBuilder.Ne(e => e.CorrelationId, null));
        filters.Add(filterBuilder.Ne(e => e.CorrelationId, ""));

        var filter = filterBuilder.And(filters);
        var sortDirection = sorting == Sorting.Ascending ? 1 : -1;

        var pipeline = dbContext.NotificationEvents.Aggregate()
            .Match(filter)
            // Sort by Action ascending so "Raised" comes before "Reset",
            // ensuring $first captures the Raised event's properties.
            .Sort(new BsonDocument { { "Action", 1 }, { "Timestamp", 1 } })
            .Group(new BsonDocument
            {
                { "_id", "$CorrelationId" },
                { "mId", new BsonDocument(First, "$MId") },
                { NotificationIdField, new BsonDocument(First, "$NotificationId") },
                { "level", new BsonDocument(First, "$Level") },
                { TitleField, new BsonDocument(First, "$Title") },
                { "localizedTitle", new BsonDocument(First, "$LocalizedTitle") },
                { "raisedTimestamp", new BsonDocument("$min", new BsonDocument(CondOperator, new BsonArray
                    {
                        new BsonDocument("$eq", new BsonArray { ActionField, "Raised" }),
                        TimestampField,
                        BsonNull.Value
                    }))
                },
                { "resetTimestamp", new BsonDocument("$min", new BsonDocument(CondOperator, new BsonArray
                    {
                        new BsonDocument("$eq", new BsonArray { ActionField, "Reset" }),
                        TimestampField,
                        BsonNull.Value
                    }))
                }
            })
            .AppendStage<BsonDocument>(new BsonDocument("$addFields", new BsonDocument
            {
                { "timestampRaised", new BsonDocument("$ifNull", new BsonArray { RaisedTimestampField, ResetTimestampField }) },
                { "timestampGone", ResetTimestampField },
                { DurationMsField, new BsonDocument(CondOperator, new BsonArray
                    {
                        new BsonDocument("$and", new BsonArray
                        {
                            new BsonDocument("$ne", new BsonArray { RaisedTimestampField, BsonNull.Value }),
                            new BsonDocument("$ne", new BsonArray { ResetTimestampField, BsonNull.Value })
                        }),
                        new BsonDocument("$subtract", new BsonArray { ResetTimestampField, RaisedTimestampField }),
                        BsonNull.Value
                    })
                }
            }));

        // Post-group level filter: only include pairs where the primary event's level matches
        if (level.HasValue)
        {
            pipeline = pipeline.AppendStage<BsonDocument>(new BsonDocument("$match",
                new BsonDocument("level", level.Value.ToString())));
        }

        // Use $facet for count + paginated data in a single query
        var facetResult = await pipeline
            .AppendStage<BsonDocument>(new BsonDocument("$facet", new BsonDocument
            {
                { "metadata", new BsonArray { new BsonDocument("$count", "totalCount") } },
                { "data", new BsonArray
                    {
                        new BsonDocument("$sort", new BsonDocument("timestampRaised", sortDirection)),
                        new BsonDocument("$skip", skip),
                        new BsonDocument("$limit", take)
                    }
                }
            }))
            .SingleAsync(cancellationToken)
            .ConfigureAwait(false);

        long totalCount = facetResult["metadata"].AsBsonArray.Count > 0
            ? facetResult["metadata"].AsBsonArray[0]["totalCount"].AsInt32
            : 0;

        var items = facetResult["data"].AsBsonArray.Select(doc =>
        {
            var timestampGone = doc["timestampGone"].IsBsonNull ? (DateTime?)null : doc["timestampGone"].ToUniversalTime();
            var durationMs = doc[DurationMsField].IsBsonNull ? (double?)null : doc[DurationMsField].ToDouble();

            return new PairedNotificationEventDao
            {
                CorrelationId = doc["_id"].AsString,
                MId = doc["mId"].AsString,
                NotificationId = doc[NotificationIdField].AsString,
                Level = Enum.Parse<EventLevel>(doc["level"].AsString),
                Title = doc[TitleField].AsString,
                LocalizedTitle = doc["localizedTitle"].AsString,
                TimestampRaised = doc["timestampRaised"].ToUniversalTime(),
                TimestampGone = timestampGone,
                Duration = durationMs.HasValue ? TimeSpan.FromMilliseconds(durationMs.Value) : null
            };
        }).ToList();

        return (items, totalCount);
    }

    /// <inheritdoc />
    public async Task<List<LevelDistributionDao>> GetLevelDistributionAsync(
        string? mId,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken)
    {
        var filter = BuildBaseFilter(mId, level: null, from, to);

        var pipeline = dbContext.NotificationEvents.Aggregate()
            .Match(filter)
            .Group(
                e => e.Level,
                g => new LevelDistributionDao
                {
                    Level = g.Key,
                    Count = g.Count()
                });

        return await pipeline.ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<List<TimeBucketDao>> GetTimeBucketsAsync(
        string? mId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        TimeSpan bucketSize,
        CancellationToken cancellationToken)
    {
        var filter = BuildBaseFilter(mId, level, from, to);

        var (unit, binSize) = ConvertBucketSize(bucketSize);

        var pipeline = dbContext.NotificationEvents.Aggregate()
            .Match(filter)
            .Group(new BsonDocument
            {
                { "_id", new BsonDocument
                    {
                        { "timestamp", new BsonDocument("$dateTrunc", new BsonDocument
                            {
                                { "date", TimestampField },
                                { "unit", unit },
                                { "binSize", binSize }
                            })
                        },
                        { "level", new BsonDocument("$toString", "$Level") }
                    }
                },
                { "count", new BsonDocument("$sum", 1) }
            })
            .Group(new BsonDocument
            {
                { "_id", "$_id.timestamp" },
                { "distribution", new BsonDocument("$push", new BsonDocument
                    {
                        { "level", "$_id.level" },
                        { "count", "$count" }
                    })
                }
            })
            .Sort(new BsonDocument("_id", 1))
            .As<BsonDocument>();

        var bsonResults = await pipeline.ToListAsync(cancellationToken).ConfigureAwait(false);

        return bsonResults.Select(doc => new TimeBucketDao
        {
            Timestamp = doc["_id"].ToUniversalTime(),
            Distribution = doc["distribution"].AsBsonArray.Select(d => new LevelDistributionDao
            {
                Level = Enum.Parse<EventLevel>(d["level"].AsString),
                Count = d["count"].AsInt32
            }).ToList()
        }).ToList();
    }

    /// <inheritdoc />
    public async Task<List<NotificationMessageStatisticsDao>> GetMessageStatisticsAsync(
        string? mId,
        EventLevel? level,
        DateTime? from,
        DateTime? to,
        CancellationToken cancellationToken)
    {
        // Build base filter without level — level is handled separately below
        // so that Reset events are always included regardless of their level,
        // mirroring the pairing logic in QueryPairedEventsWithPaginationAsync.
        var baseFilter = BuildBaseFilter(mId, level: null, from, to);
        var filterBuilder = Builders<NotificationEventDao>.Filter;

        // When a level filter is requested, include Raised events of that level AND
        // all Reset events (which may carry a different level value).
        var levelFilter = level.HasValue
            ? filterBuilder.Or(
                filterBuilder.Eq(e => e.Level, level.Value),
                filterBuilder.Eq(e => e.Action, NotificationAction.Reset))
            : filterBuilder.Empty;

        // Additionally require a non-empty CorrelationId for duration pairing.
        var filter = filterBuilder.And(
            baseFilter,
            levelFilter,
            filterBuilder.Ne(e => e.CorrelationId, null),
            filterBuilder.Ne(e => e.CorrelationId, ""));

        var pipeline = dbContext.NotificationEvents.Aggregate()
            .Match(filter)
            .Group(new BsonDocument
            {
                { "_id", "$CorrelationId" },
                { NotificationIdField, new BsonDocument(First, "$NotificationId") },
                { TitleField, new BsonDocument(First, "$Title") },
                { "level", new BsonDocument(First, new BsonDocument("$toString", "$Level")) },
                { "raisedTimestamp", new BsonDocument("$min", new BsonDocument(CondOperator, new BsonArray
                    {
                        new BsonDocument("$eq", new BsonArray { ActionField, "Raised" }),
                        TimestampField,
                        BsonNull.Value
                    }))
                },
                { "resetTimestamp", new BsonDocument("$min", new BsonDocument(CondOperator, new BsonArray
                    {
                        new BsonDocument("$eq", new BsonArray { ActionField, "Reset" }),
                        TimestampField,
                        BsonNull.Value
                    }))
                }
            })
            .AppendStage<BsonDocument>(new BsonDocument("$addFields", new BsonDocument(DurationMsField,
                new BsonDocument(CondOperator, new BsonArray
                {
                    new BsonDocument("$and", new BsonArray
                    {
                        new BsonDocument("$ne", new BsonArray { RaisedTimestampField, BsonNull.Value }),
                        new BsonDocument("$ne", new BsonArray { ResetTimestampField, BsonNull.Value })
                    }),
                    new BsonDocument("$subtract", new BsonArray { ResetTimestampField, RaisedTimestampField }),
                    0
                })
            )))
            .Group(new BsonDocument
            {
                { "_id", new BsonDocument
                    {
                        { NotificationIdField, "$notificationId" },
                        { TitleField, "$title" }
                    }
                },
                { "level", new BsonDocument(First, "$level") },
                { "occurrenceCount", new BsonDocument("$sum", 1) },
                { "totalDurationMs", new BsonDocument("$sum", "$durationMs") },
                { "avgDurationMs", new BsonDocument("$avg", "$durationMs") }
            })
            .Sort(new BsonDocument("occurrenceCount", -1))
            .As<BsonDocument>();

        var bsonResults = await pipeline.ToListAsync(cancellationToken).ConfigureAwait(false);

        const long ticksPerMs = TimeSpan.TicksPerMillisecond;

        return bsonResults.Select(doc => new NotificationMessageStatisticsDao
        {
            NotificationId = doc["_id"][NotificationIdField].AsString,
            Title = doc["_id"][TitleField].AsString,
            Level = Enum.Parse<EventLevel>(doc["level"].AsString),
            OccurrenceCount = doc["occurrenceCount"].AsInt32,
            TotalDurationTicks = (long)(doc["totalDurationMs"].ToDouble() * ticksPerMs),
            AverageDurationTicks = (long)(doc["avgDurationMs"].ToDouble() * ticksPerMs)
        }).ToList();
    }

    private static FilterDefinition<NotificationEventDao> BuildBaseFilter(
        string? mId,
        EventLevel? level,
        DateTime? from,
        DateTime? to)
    {
        var filterBuilder = Builders<NotificationEventDao>.Filter;
        var filters = new List<FilterDefinition<NotificationEventDao>>();

        if (!string.IsNullOrEmpty(mId))
        {
            filters.Add(filterBuilder.Eq(e => e.MId, mId));
        }
        if (level.HasValue)
        {
            filters.Add(filterBuilder.Eq(e => e.Level, level.Value));
        }
        if (from.HasValue)
        {
            filters.Add(filterBuilder.Gte(e => e.Timestamp, from.Value));
        }
        if (to.HasValue)
        {
            filters.Add(filterBuilder.Lte(e => e.Timestamp, to.Value));
        }

        return filters.Count > 0 ? filterBuilder.And(filters) : filterBuilder.Empty;
    }

    private static (string Unit, int BinSize) ConvertBucketSize(TimeSpan bucketSize)
    {
        var totalDays = (long)bucketSize.TotalDays;
        if (totalDays >= 1 && bucketSize == TimeSpan.FromDays(totalDays))
        {
            return ("day", (int)totalDays);
        }

        var totalHours = (long)bucketSize.TotalHours;
        if (totalHours >= 1 && bucketSize == TimeSpan.FromHours(totalHours))
        {
            return ("hour", (int)totalHours);
        }

        var totalMinutes = (long)bucketSize.TotalMinutes;
        if (totalMinutes >= 1 && bucketSize == TimeSpan.FromMinutes(totalMinutes))
        {
            return ("minute", (int)totalMinutes);
        }

        return ("minute", Math.Max(1, (int)bucketSize.TotalMinutes));
    }
}
