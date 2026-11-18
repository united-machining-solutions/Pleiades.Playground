using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Timeseries.Api.Services.Downsampling;
using Pleiades.Playground.Timeseries.Common.Exceptions;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Services.MongoDb;

/// <summary>
/// MongoDB Time-Series-Collection-backed implementation of <see cref="ITimeseriesDbService"/>.
/// Reads, writes and aggregations all use the official MongoDB driver against three
/// dedicated collections (<c>baseunitvalues</c>, <c>stringvalues</c>, <c>booleanvalues</c>).
/// </summary>
internal sealed class MongoTimeseriesService : ITimeseriesDbService
{
    private readonly IMongoCollection<BsonDocument> _baseUnit;
    private readonly IMongoCollection<BsonDocument> _string;
    private readonly IMongoCollection<BsonDocument> _boolean;
    private readonly IMongoCollection<BsonDocument> _topicActivity;
    private readonly IMongoDatabase _database;
    private readonly ILogger<MongoTimeseriesService> _logger;
    private readonly TimeSpan _maxQueryTime;

    /// <summary>
    /// In-memory guard that suppresses redundant <c>topic_activity</c> upserts: only the first
    /// sample of a <c>(type, topic, minute)</c> triggers a write. Purely an optimization — the
    /// upsert is idempotent, so a forgotten key just causes a harmless re-upsert.
    /// </summary>
    private readonly MemoryCache _topicActivityGuard;
    private readonly MemoryCacheEntryOptions _topicActivityEntryOptions;

    #region LoggerMessages

    private static readonly Action<ILogger, string, DateTime, DateTime, Exception?> LogReadFailed =
        LoggerMessage.Define<string, DateTime, DateTime>(LogLevel.Warning, new EventId(1, "ReadFailed"),
            "MongoDB read failed for topic '{Topic}' between {Start:o} and {Stop:o}");

    private static readonly Action<ILogger, string, Exception?> LogTopicsQueryFailed =
        LoggerMessage.Define<string>(LogLevel.Warning, new EventId(2, "TopicsQueryFailed"),
            "MongoDB topics query failed for collection '{Collection}'");

    private static readonly Action<ILogger, string, Exception?> LogTopicActivityWriteFailed =
        LoggerMessage.Define<string>(LogLevel.Warning, new EventId(3, "TopicActivityWriteFailed"),
            "MongoDB topic_activity upsert failed for type '{Type}'; discovery may miss topics until the next sample re-upserts");

    #endregion

    public MongoTimeseriesService(IMongoDatabase database, IOptions<MongoTimeseriesSettings> settings, ILogger<MongoTimeseriesService> logger)
    {
        ArgumentNullException.ThrowIfNull(database);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(logger);

        _database = database;
        _logger = logger;
        _maxQueryTime = TimeSpan.FromSeconds(settings.Value.MaxQueryTimeSeconds);
        _baseUnit = database.GetCollection<BsonDocument>(MeasurementNames.BaseUnitValues);
        _string = database.GetCollection<BsonDocument>(MeasurementNames.StringValues);
        _boolean = database.GetCollection<BsonDocument>(MeasurementNames.BooleanValues);
        _topicActivity = database.GetCollection<BsonDocument>(MeasurementNames.TopicActivity);
        _topicActivityGuard = new MemoryCache(new MemoryCacheOptions { SizeLimit = settings.Value.TopicActivityCacheSize });
        // Two minutes comfortably outlives a single minute bucket, so the key for the current
        // minute never expires before the bucket rolls over (would only cost a harmless re-upsert).
        _topicActivityEntryOptions = new MemoryCacheEntryOptions
        {
            Size = 1,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2),
        };
    }

    #region Ingestion

    /// <inheritdoc />
    public async Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, BaseUnitSeriesRequestDto> values, CancellationToken cancellationToken = default)
    {
        if (values is null || values.Count == 0)
        {
            return new TimeseriesInsertResultDto { ValuesCount = 0 };
        }

        var documents = new List<BsonDocument>();
        var activity = new List<(string Topic, long Minute)>();
        foreach (var kvp in values)
        {
            var unit = kvp.Value.Unit.ToString();
            var minutes = new HashSet<long>();
            foreach (var point in kvp.Value.DataPoints)
            {
                var ts = DateTime.SpecifyKind(point.Timestamp, DateTimeKind.Utc);
                documents.Add(new BsonDocument
                {
                    { FieldNames.Timestamp, ts },
                    { FieldNames.Meta, new BsonDocument { { FieldNames.Topic, kvp.Key }, { FieldNames.Unit, unit } } },
                    { FieldNames.Value, point.Value },
                });
                minutes.Add(MinuteEpoch(ts));
            }

            foreach (var minute in minutes)
            {
                activity.Add((kvp.Key, minute));
            }
        }

        var result = await InsertManyAsync(_baseUnit, documents, MeasurementNames.BaseUnitValues, cancellationToken).ConfigureAwait(false);
        await RecordTopicActivityAsync(TopicActivityTypes.BaseUnit, activity, cancellationToken).ConfigureAwait(false);
        return result;
    }

    /// <inheritdoc />
    public async Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, StringSeriesRequestDto> values, CancellationToken cancellationToken = default)
    {
        if (values is null || values.Count == 0)
        {
            return new TimeseriesInsertResultDto { ValuesCount = 0 };
        }

        var documents = new List<BsonDocument>();
        var activity = new List<(string Topic, long Minute)>();
        foreach (var kvp in values)
        {
            var minutes = new HashSet<long>();
            foreach (var point in kvp.Value.DataPoints)
            {
                var value = point.Value ?? throw new InvalidOperationException("Value is missing");
                var ts = DateTime.SpecifyKind(point.Timestamp, DateTimeKind.Utc);
                documents.Add(new BsonDocument
                {
                    { FieldNames.Timestamp, ts },
                    { FieldNames.Meta, new BsonDocument { { FieldNames.Topic, kvp.Key } } },
                    { FieldNames.Value, value },
                });
                minutes.Add(MinuteEpoch(ts));
            }

            foreach (var minute in minutes)
            {
                activity.Add((kvp.Key, minute));
            }
        }

        var result = await InsertManyAsync(_string, documents, MeasurementNames.StringValues, cancellationToken).ConfigureAwait(false);
        await RecordTopicActivityAsync(TopicActivityTypes.String, activity, cancellationToken).ConfigureAwait(false);
        return result;
    }

    /// <inheritdoc />
    public async Task<TimeseriesInsertResultDto> AddAsync(Dictionary<string, BooleanSeriesRequestDto> values, CancellationToken cancellationToken = default)
    {
        if (values is null || values.Count == 0)
        {
            return new TimeseriesInsertResultDto { ValuesCount = 0 };
        }

        var documents = new List<BsonDocument>();
        var activity = new List<(string Topic, long Minute)>();
        foreach (var kvp in values)
        {
            var minutes = new HashSet<long>();
            foreach (var point in kvp.Value.DataPoints)
            {
                var ts = DateTime.SpecifyKind(point.Timestamp, DateTimeKind.Utc);
                documents.Add(new BsonDocument
                {
                    { FieldNames.Timestamp, ts },
                    { FieldNames.Meta, new BsonDocument { { FieldNames.Topic, kvp.Key } } },
                    { FieldNames.Value, point.Value },
                });
                minutes.Add(MinuteEpoch(ts));
            }

            foreach (var minute in minutes)
            {
                activity.Add((kvp.Key, minute));
            }
        }

        var result = await InsertManyAsync(_boolean, documents, MeasurementNames.BooleanValues, cancellationToken).ConfigureAwait(false);
        await RecordTopicActivityAsync(TopicActivityTypes.Boolean, activity, cancellationToken).ConfigureAwait(false);
        return result;
    }

    private static async Task<TimeseriesInsertResultDto> InsertManyAsync(
        IMongoCollection<BsonDocument> collection, List<BsonDocument> documents, string collectionName, CancellationToken cancellationToken)
    {
        if (documents.Count == 0)
        {
            return new TimeseriesInsertResultDto { ValuesCount = 0 };
        }

        try
        {
            var options = new InsertManyOptions { IsOrdered = false };
            await collection.InsertManyAsync(documents, options, cancellationToken).ConfigureAwait(false);
            return new TimeseriesInsertResultDto { ValuesCount = documents.Count };
        }
        catch (MongoBulkWriteException ex)
        {
            throw new PleiadesWriteException($"Failed to write data to MongoDB collection '{collectionName}'.", ex);
        }
        catch (MongoException ex)
        {
            throw new PleiadesWriteException($"Failed to write data to MongoDB collection '{collectionName}'.", ex);
        }
    }

    /// <summary>
    /// Idempotently records that each <c>(type, topic, minute)</c> in <paramref name="keys"/> has data,
    /// into the <c>topic_activity</c> companion collection. Range-accurate topic discovery then reads
    /// this tiny, index-covered collection instead of unpacking time-series buckets.
    /// <para>
    /// The caller already collapses each topic's per-minute samples into distinct
    /// <c>(topic, minute)</c> tuples (see the ingestion overloads), so the hot per-value work — string
    /// allocation, set and cache lookups — happens once per <c>(topic, minute)</c> rather than per
    /// sample. The string <c>_id</c> is materialised only for upserts that survive de-duplication.
    /// An in-memory guard further suppresses minutes already written by an earlier batch.
    /// </para>
    /// Failures are logged, never thrown — ingestion of the measurement values is the primary contract
    /// and must succeed regardless.
    /// </summary>
    private async Task RecordTopicActivityAsync(string type, List<(string Topic, long Minute)> keys, CancellationToken cancellationToken)
    {
        if (keys.Count == 0)
        {
            return;
        }

        var models = new List<WriteModel<BsonDocument>>();
        var newKeys = new List<(string Type, string Topic, long Minute)>();
        var seenInBatch = new HashSet<(string, long)>();

        foreach (var (topic, minute) in keys)
        {
            // In-batch de-dup: type is constant for this call, so (topic, minute) suffices here.
            if (!seenInBatch.Add((topic, minute)))
            {
                continue;
            }

            // The guard is a single MemoryCache shared across all three value types, so its key MUST
            // include type — otherwise a baseunit sample would wrongly suppress the string upsert for
            // the same topic and minute.
            var guardKey = (type, topic, minute);
            if (_topicActivityGuard.TryGetValue(guardKey, out _))
            {
                continue;
            }

            // String _id is built only for surviving upserts (not per sample).
            var id = string.Concat(type, "|", topic, "|", minute.ToString(CultureInfo.InvariantCulture));
            var bucket = DateTime.UnixEpoch.AddMinutes(minute);
            var filter = Builders<BsonDocument>.Filter.Eq("_id", id);
            var update = Builders<BsonDocument>.Update
                .SetOnInsert(FieldNames.Type, type)
                .SetOnInsert(FieldNames.Topic, topic)
                .SetOnInsert(FieldNames.Bucket, bucket);
            models.Add(new UpdateOneModel<BsonDocument>(filter, update) { IsUpsert = true });
            newKeys.Add(guardKey);
        }

        if (models.Count == 0)
        {
            return;
        }

        try
        {
            await _topicActivity.BulkWriteAsync(models, new BulkWriteOptions { IsOrdered = false }, cancellationToken).ConfigureAwait(false);

            // Populate the guard only AFTER a successful flush. If the upsert failed, the key stays
            // unguarded so the next sample of the same minute retries it (self-healing).
            foreach (var key in newKeys)
            {
                _topicActivityGuard.Set(key, true, _topicActivityEntryOptions);
            }
        }
        catch (MongoException ex)
        {
            LogTopicActivityWriteFailed(_logger, type, ex);
        }
    }

    private static DateTime FloorToMinuteUtc(DateTime tsUtc) =>
        new(tsUtc.Year, tsUtc.Month, tsUtc.Day, tsUtc.Hour, tsUtc.Minute, 0, DateTimeKind.Utc);

    private static long MinuteEpoch(DateTime tsUtc) =>
        (long)(FloorToMinuteUtc(tsUtc.ToUniversalTime()) - DateTime.UnixEpoch).TotalMinutes;

    #endregion

    #region Reads

    /// <inheritdoc />
    public async Task<Dictionary<string, BaseUnitSeriesRequestDto>> GetBaseUnitValuesByTopicAndTimeRangeAsync(
        string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting,
        bool downsample, CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, BaseUnitSeriesRequestDto>();
        await ExecuteFindAsync(_baseUnit, topic, startTime, stopTime, limit, timeout, sorting, downsample,
            doc =>
            {
                var rowTopic = doc[FieldNames.Meta][FieldNames.Topic].AsString;
                var unit = doc[FieldNames.Meta].AsBsonDocument.GetValue(FieldNames.Unit, BsonString.Empty).AsString;
                if (!result.TryGetValue(rowTopic, out var series))
                {
                    series = new BaseUnitSeriesRequestDto { Unit = Enum.Parse<BaseUnit>(unit) };
                    result.Add(rowTopic, series);
                }
                series.DataPoints.Add(new DataPointDto<double>
                {
                    Timestamp = doc[FieldNames.Timestamp].ToUniversalTime(),
                    Value = doc[FieldNames.Value].ToDouble(),
                });
            },
            cancellationToken).ConfigureAwait(false);

        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(result, limit, downsample);
        return result;
    }

    /// <inheritdoc />
    public async Task<Dictionary<string, StringSeriesRequestDto>> GetStringValuesByTopicAndTimeRangeAsync(
        string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting,
        bool downsample, CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, StringSeriesRequestDto>();
        await ExecuteFindAsync(_string, topic, startTime, stopTime, limit, timeout, sorting, downsample,
            doc =>
            {
                var rowTopic = doc[FieldNames.Meta][FieldNames.Topic].AsString;
                if (!result.TryGetValue(rowTopic, out var series))
                {
                    series = new StringSeriesRequestDto();
                    result.Add(rowTopic, series);
                }
                series.DataPoints.Add(new DataPointDto<string>
                {
                    Timestamp = doc[FieldNames.Timestamp].ToUniversalTime(),
                    Value = doc[FieldNames.Value].AsString,
                });
            },
            cancellationToken).ConfigureAwait(false);

        TimeseriesDownsampler.ApplyStringDownsamplingMetadata(result, limit, downsample);
        return result;
    }

    /// <inheritdoc />
    public async Task<Dictionary<string, BooleanSeriesRequestDto>> GetBooleanValuesByTopicAndTimeRangeAsync(
        string topic, DateTime startTime, DateTime stopTime, long limit, TimeSpan timeout, Sorting sorting,
        bool downsample, CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, BooleanSeriesRequestDto>();
        await ExecuteFindAsync(_boolean, topic, startTime, stopTime, limit, timeout, sorting, downsample,
            doc =>
            {
                var rowTopic = doc[FieldNames.Meta][FieldNames.Topic].AsString;
                if (!result.TryGetValue(rowTopic, out var series))
                {
                    series = new BooleanSeriesRequestDto();
                    result.Add(rowTopic, series);
                }
                series.DataPoints.Add(new DataPointDto<bool>
                {
                    Timestamp = doc[FieldNames.Timestamp].ToUniversalTime(),
                    Value = doc[FieldNames.Value].AsBoolean,
                });
            },
            cancellationToken).ConfigureAwait(false);

        TimeseriesDownsampler.ApplyBooleanDownsamplingMetadata(result, limit, downsample);
        return result;
    }

    private async Task ExecuteFindAsync(
        IMongoCollection<BsonDocument> collection,
        string topic,
        DateTime startTime,
        DateTime stopTime,
        long limit,
        TimeSpan timeout,
        Sorting sorting,
        bool downsample,
        Action<BsonDocument> consume,
        CancellationToken cancellationToken)
    {
        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            var startUtc = startTime.ToUniversalTime();
            var stopUtc = stopTime.ToUniversalTime();
            var filter = BuildTimeRangeFilter(topic, startUtc, stopUtc) &
                         Builders<BsonDocument>.Filter.Exists(FieldNames.Value) &
                         Builders<BsonDocument>.Filter.Ne(FieldNames.Value, BsonNull.Value);

            var sort = sorting == Sorting.Ascending
                ? Builders<BsonDocument>.Sort.Ascending(FieldNames.Timestamp)
                : Builders<BsonDocument>.Sort.Descending(FieldNames.Timestamp);

            var findOptions = new FindOptions<BsonDocument, BsonDocument>
            {
                Sort = sort,
                Limit = downsample ? null : (int?)Math.Min(limit, int.MaxValue),
                AllowDiskUse = true,
                MaxTime = timeout,
            };

            using var cursor = await collection.FindAsync(filter, findOptions, linkedCts.Token).ConfigureAwait(false);

            while (await cursor.MoveNextAsync(linkedCts.Token).ConfigureAwait(false))
            {
                foreach (var doc in cursor.Current)
                {
                    consume(doc);
                }
            }
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"Query timed out after {timeout}.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (MongoException ex)
        {
            LogReadFailed(_logger, topic, startTime, stopTime, ex);
            throw new PleiadesReadException("Failed to execute MongoDB query.", ex);
        }
    }

    private static FilterDefinition<BsonDocument> BuildTimeRangeFilter(string topic, DateTime startUtc, DateTime stopUtc)
    {
        // Topic is already URL-decoded by the endpoint; build either an equality or anchored-regex
        // filter ('*' wildcard maps to a MongoDB regex).
        var topicFilter = TopicFilter.HasWildcard(topic)
            ? Builders<BsonDocument>.Filter.Regex(FieldNames.MetaTopic, new BsonRegularExpression(TopicFilter.ToAnchoredRegex(topic)))
            : Builders<BsonDocument>.Filter.Eq(FieldNames.MetaTopic, topic);

        return topicFilter
            & Builders<BsonDocument>.Filter.Gte(FieldNames.Timestamp, startUtc)
            & Builders<BsonDocument>.Filter.Lte(FieldNames.Timestamp, stopUtc);
    }

    #endregion

    #region Topics

    /// <inheritdoc />
    /// <remarks>
    /// Range-accurate discovery is served entirely from the <c>topic_activity</c> companion
    /// collection (written alongside every measurement, see <see cref="RecordTopicActivityAsync"/>).
    /// A single index-covered <c>$match → $group</c> over minute buckets replaces the former
    /// per-collection bucket-unpacking aggregations, taking discovery latency from seconds to
    /// single-digit milliseconds. The window is widened to whole minutes, so a sub-minute or
    /// grid-unaligned window can return a minimal superset at the edge minutes; the downstream
    /// per-topic data fetch with an exact <c>ts</c> filter corrects this (a "phantom" topic simply
    /// yields zero rows).
    /// </remarks>
    public async Task<TopicsDto> GetTopicsByTimeRangeAsync(DateTime startTime, DateTime stopTime, TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        var startBucket = FloorToMinuteUtc(startTime.ToUniversalTime());
        var stopBucket = FloorToMinuteUtc(stopTime.ToUniversalTime());
        var topics = new TopicsDto();

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        var pipeline = new[]
        {
            new BsonDocument("$match", new BsonDocument
            {
                { FieldNames.Bucket, new BsonDocument { { "$gte", startBucket }, { "$lte", stopBucket } } },
            }),
            new BsonDocument("$group", new BsonDocument("_id", new BsonDocument
            {
                { FieldNames.Type, "$" + FieldNames.Type },
                { FieldNames.Topic, "$" + FieldNames.Topic },
            })),
        };

        try
        {
            using var cursor = await _topicActivity
                .AggregateAsync<BsonDocument>(pipeline, new AggregateOptions { AllowDiskUse = true, MaxTime = _maxQueryTime }, linkedCts.Token)
                .ConfigureAwait(false);

            while (await cursor.MoveNextAsync(linkedCts.Token).ConfigureAwait(false))
            {
                foreach (var doc in cursor.Current)
                {
                    var id = doc["_id"].AsBsonDocument;
                    var topic = id[FieldNames.Topic].AsString;
                    if (string.IsNullOrWhiteSpace(topic))
                    {
                        continue;
                    }

                    switch (id[FieldNames.Type].AsString)
                    {
                        case TopicActivityTypes.BaseUnit:
                            topics.BaseUnitTopics.Add(topic);
                            break;
                        case TopicActivityTypes.String:
                            topics.StringTopics.Add(topic);
                            break;
                        case TopicActivityTypes.Boolean:
                            topics.BooleanTopics.Add(topic);
                            break;
                    }
                }
            }
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"Topics query timed out after {timeout}.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (MongoException ex)
        {
            LogTopicsQueryFailed(_logger, MeasurementNames.TopicActivity, ex);
            throw new PleiadesReadException($"Failed to query MongoDB topics for collection '{MeasurementNames.TopicActivity}'.", ex);
        }

        topics.BaseUnitTopics.Sort(StringComparer.Ordinal);
        topics.StringTopics.Sort(StringComparer.Ordinal);
        topics.BooleanTopics.Sort(StringComparer.Ordinal);
        return topics;
    }

    #endregion

    #region Statistics

    /// <inheritdoc />
    [SuppressMessage("Design", "CA1031:Do not catch general exception types",
        Justification = "Aggregation faults are normalised to PleiadesReadException so the endpoint surfaces a uniform 500.")]
    public async Task<Dictionary<string, StatisticValueDtoV1>> GetStatisticValuesByTopicAndTimeRangesAsync(
        string topic, List<TimeRangeDtoV1> timeWindows, TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(timeWindows);

        var resultDict = new Dictionary<string, StatisticValueDtoV1>();
        if (timeWindows.Count == 0)
        {
            return resultDict;
        }

        var pipeline = BuildStatisticsPipeline(topic, timeWindows);

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            using var cursor = await _baseUnit.AggregateAsync<BsonDocument>(pipeline, new AggregateOptions { AllowDiskUse = true, MaxTime = timeout }, linkedCts.Token).ConfigureAwait(false);
            while (await cursor.MoveNextAsync(linkedCts.Token).ConfigureAwait(false))
            {
                foreach (var doc in cursor.Current)
                {
                    var key = doc["_id"].AsString;
                    if (string.IsNullOrEmpty(key))
                    {
                        continue;
                    }
                    var unitString = doc.GetValue("unit", BsonNull.Value);
                    if (unitString.IsBsonNull || string.IsNullOrEmpty(unitString.AsString))
                    {
                        throw new InvalidOperationException("Unit is missing");
                    }

                    var medianArray = doc.GetValue("median", new BsonArray()).AsBsonArray;
                    var median = medianArray.Count > 0 && !medianArray[0].IsBsonNull
                        ? medianArray[0].ToDouble()
                        : double.NaN;

                    resultDict[key] = new StatisticValueDtoV1
                    {
                        Unit = Enum.Parse<BaseUnit>(unitString.AsString),
                        Max = doc["max"].ToDouble(),
                        Min = doc["min"].ToDouble(),
                        Mean = doc["mean"].ToDouble(),
                        Std = doc.GetValue("std", BsonNull.Value).IsBsonNull ? double.NaN : doc["std"].ToDouble(),
                        Median = median,
                        Delta = doc["last"].ToDouble() - doc["first"].ToDouble(),
                        Count = doc["count"].ToInt64(),
                    };
                }
            }
        }
        catch (PleiadesReadException)
        {
            throw;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"Statistics query timed out after {timeout}.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new PleiadesReadException("Failed to execute MongoDB statistics aggregation.", ex);
        }

        return resultDict;
    }

    private static BsonDocument[] BuildStatisticsPipeline(string topic, List<TimeRangeDtoV1> timeWindows)
    {
        // Topic predicate: equality or anchored regex ('*' wildcard maps to a MongoDB regex).
        // Topic is already URL-decoded by the endpoint.
        BsonValue topicValue = TopicFilter.HasWildcard(topic)
            ? new BsonRegularExpression(TopicFilter.ToAnchoredRegex(topic))
            : topic;

        // Time-window predicate: $or over each [start, stop] window.
        var orWindows = new BsonArray();
        foreach (var window in timeWindows)
        {
            orWindows.Add(new BsonDocument
            {
                {
                    FieldNames.Timestamp, new BsonDocument
                    {
                        { "$gte", window.Start.UtcDateTime },
                        { "$lte", window.Stop.UtcDateTime },
                    }
                },
            });
        }

        var match = new BsonDocument("$match", new BsonDocument
        {
            { FieldNames.MetaTopic, topicValue },
            { FieldNames.Value, new BsonDocument("$ne", BsonNull.Value) },
            { "$or", orWindows },
        });

        // Group by topic, computing aggregates plus an approximate median via $percentile.
        // NOTE: $percentile requires MongoDB 7.0+; "approximate" uses the t-digest method.
        var group = new BsonDocument("$group", new BsonDocument
        {
            { "_id", $"${FieldNames.MetaTopic}" },
            { "unit", new BsonDocument("$last", $"${FieldNames.MetaUnit}") },
            { "max", new BsonDocument("$max", $"${FieldNames.Value}") },
            { "min", new BsonDocument("$min", $"${FieldNames.Value}") },
            { "mean", new BsonDocument("$avg", $"${FieldNames.Value}") },
            { "std", new BsonDocument("$stdDevSamp", $"${FieldNames.Value}") },
            { "first", new BsonDocument("$first", $"${FieldNames.Value}") },
            { "last", new BsonDocument("$last", $"${FieldNames.Value}") },
            { "count", new BsonDocument("$sum", 1) },
            {
                "median", new BsonDocument("$percentile", new BsonDocument
                {
                    { "input", $"${FieldNames.Value}" },
                    { "p", new BsonArray { 0.5 } },
                    { "method", "approximate" },
                })
            },
        });

        var sort = new BsonDocument("$sort", new BsonDocument("_id", 1));

        return [match, group, sort];
    }

    #endregion

    /// <inheritdoc />
    [SuppressMessage("Design", "CA1031:Do not catch general exception types",
        Justification = "PingAsync must never throw — health-check semantics require returning false on any error.")]
    public async Task<bool> PingAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var command = new BsonDocument("ping", 1);
            var result = await _database.RunCommandAsync<BsonDocument>(command, cancellationToken: cancellationToken).ConfigureAwait(false);
            return result.GetValue("ok", 0).ToDouble() > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        // IMongoDatabase / IMongoClient are owned by the DI container; only the guard is ours.
        _topicActivityGuard.Dispose();
    }
}
