using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Pleiades.Playground.Timeseries.Api.Services.MongoDb;

/// <summary>
/// Ensures the three MongoDB Time-Series collections (and their compound index plus
/// optional TTL) exist on startup. Fail-fast if MongoDB is unreachable within 30 seconds.
/// </summary>
internal sealed class MongoTimeseriesInitializer(
    IMongoDatabase database,
    IOptions<MongoTimeseriesSettings> options,
    ILogger<MongoTimeseriesInitializer> logger) : IHostedLifecycleService
{
    #region LoggerMessages

    private static readonly Action<ILogger, Exception?> LogInitializationComplete =
        LoggerMessage.Define(LogLevel.Information, new EventId(1, "InitializationComplete"),
            "MongoDB timeseries initialization completed successfully");

    private static readonly Action<ILogger, Exception?> LogInitializationFailed =
        LoggerMessage.Define(LogLevel.Error, new EventId(2, "InitializationFailed"),
            "MongoDB timeseries initialization failed");

    private static readonly Action<ILogger, string, Exception?> LogInitializationSkipped =
        LoggerMessage.Define<string>(LogLevel.Information, new EventId(3, "InitializationSkipped"),
            "MongoDB timeseries initialization skipped ({Reason})");

    private static readonly Action<ILogger, string, Exception?> LogCollectionEnsured =
        LoggerMessage.Define<string>(LogLevel.Information, new EventId(4, "CollectionEnsured"),
            "MongoDB collection '{Collection}' is present");

    private static readonly Action<ILogger, string, TimeSpan, Exception?> LogTtlApplied =
        LoggerMessage.Define<string, TimeSpan>(LogLevel.Information, new EventId(5, "TtlApplied"),
            "MongoDB TTL of {Period} applied to collection '{Collection}'");

    #endregion

    private readonly MongoTimeseriesSettings _settings = options.Value;

    public async Task StartingAsync(CancellationToken cancellationToken)
    {
        if (!_settings.EnsureIndexesOnStartup)
        {
            LogInitializationSkipped(logger, "EnsureIndexesOnStartup is disabled", null);
            return;
        }

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken, timeoutCts.Token);

        try
        {
            // MongoDB's ExpireAfter is natively a TimeSpan, so the retention period flows through
            // as-is. Non-positive values disable the TTL.
            var ttl = _settings.DataRetentionPeriod is { } retention && retention > TimeSpan.Zero
                ? retention
                : (TimeSpan?)null;

            await EnsureTimeseriesCollectionAsync(MeasurementNames.BaseUnitValues, ttl, linkedCts.Token).ConfigureAwait(false);
            await EnsureTimeseriesCollectionAsync(MeasurementNames.StringValues, ttl, linkedCts.Token).ConfigureAwait(false);
            await EnsureTimeseriesCollectionAsync(MeasurementNames.BooleanValues, ttl, linkedCts.Token).ConfigureAwait(false);

            await EnsureCompoundIndexAsync(MeasurementNames.BaseUnitValues, linkedCts.Token).ConfigureAwait(false);
            await EnsureCompoundIndexAsync(MeasurementNames.StringValues, linkedCts.Token).ConfigureAwait(false);
            await EnsureCompoundIndexAsync(MeasurementNames.BooleanValues, linkedCts.Token).ConfigureAwait(false);

            await EnsureTopicActivityCollectionAsync(ttl, linkedCts.Token).ConfigureAwait(false);

            LogInitializationComplete(logger, null);
        }
        catch (Exception ex)
        {
            LogInitializationFailed(logger, ex);
            throw;
        }
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppingAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task EnsureTimeseriesCollectionAsync(string name, TimeSpan? ttl, CancellationToken cancellationToken)
    {
        var existsCursor = await database.ListCollectionNamesAsync(
            new ListCollectionNamesOptions { Filter = new BsonDocument("name", name) },
            cancellationToken).ConfigureAwait(false);
        var existing = await existsCursor.AnyAsync(cancellationToken).ConfigureAwait(false);

        if (!existing)
        {
            // bucketMaxSpanSeconds + bucketRoundingSeconds give finer control than the
            // default Granularity=Seconds (which targets 1h spans). At ~10 Hz × thousands
            // of topics, 60 s buckets keep the per-bucket document count well below the
            // 1000-doc default close-out threshold and reduce bucket-catalog memory pressure.
            // NOTE: granularity and bucketMaxSpan/bucketRounding are mutually exclusive.
            var createOptions = new CreateCollectionOptions
            {
                TimeSeriesOptions = new TimeSeriesOptions(
                    timeField: FieldNames.Timestamp,
                    metaField: FieldNames.Meta,
                    granularity: null,
                    bucketMaxSpanSeconds: 60,
                    bucketRoundingSeconds: 60),
            };

            if (ttl.HasValue)
            {
                createOptions.ExpireAfter = ttl.Value;
            }

            await database.CreateCollectionAsync(name, createOptions, cancellationToken).ConfigureAwait(false);
            LogCollectionEnsured(logger, name, null);
            if (ttl.HasValue)
            {
                LogTtlApplied(logger, name, ttl.Value, null);
            }
            return;
        }

        LogCollectionEnsured(logger, name, null);

        // Collection already exists — reapply TTL via collMod so config changes are picked up.
        // collMod only accepts a numeric expireAfterSeconds, so the TimeSpan is converted here.
        if (ttl.HasValue)
        {
            var command = new BsonDocument
            {
                { "collMod", name },
                { "expireAfterSeconds", (long)ttl.Value.TotalSeconds },
            };
            await database.RunCommandAsync<BsonDocument>(command, cancellationToken: cancellationToken).ConfigureAwait(false);
            LogTtlApplied(logger, name, ttl.Value, null);
        }
    }

    private async Task EnsureCompoundIndexAsync(string collectionName, CancellationToken cancellationToken)
    {
        var collection = database.GetCollection<BsonDocument>(collectionName);
        var indexKeys = Builders<BsonDocument>.IndexKeys
            .Ascending(FieldNames.MetaTopic)
            .Ascending(FieldNames.Timestamp);

        // CreateOne is idempotent: an identical key spec is a no-op.
        var model = new CreateIndexModel<BsonDocument>(
            indexKeys,
            new CreateIndexOptions { Name = "meta_topic_ts" });

        await collection.Indexes.CreateOneAsync(model, cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    private const string TopicActivityTtlIndexName = "bucket_ttl";

    /// <summary>
    /// Ensures the <c>topic_activity</c> companion collection (regular, NOT time-series) used for
    /// range-accurate topic discovery. The compound index <c>{bucket, type, topic}</c> fully covers
    /// the discovery <c>$match → $group</c>; the optional single-field TTL index on <c>bucket</c>
    /// mirrors the raw-data retention. The collection is created implicitly by the first index.
    /// </summary>
    private async Task EnsureTopicActivityCollectionAsync(TimeSpan? ttl, CancellationToken cancellationToken)
    {
        var collection = database.GetCollection<BsonDocument>(MeasurementNames.TopicActivity);

        // Compound index covers the discovery query (match on bucket range, group by type + topic).
        var coveringIndex = new CreateIndexModel<BsonDocument>(
            Builders<BsonDocument>.IndexKeys
                .Ascending(FieldNames.Bucket)
                .Ascending(FieldNames.Type)
                .Ascending(FieldNames.Topic),
            new CreateIndexOptions { Name = "bucket_type_topic" });
        await collection.Indexes.CreateOneAsync(coveringIndex, cancellationToken: cancellationToken).ConfigureAwait(false);

        LogCollectionEnsured(logger, MeasurementNames.TopicActivity, null);

        // TTL index maintenance. IMPORTANT: never drop-and-rebuild on every startup — on a large
        // topic_activity collection an index rebuild can exceed the 30 s init budget and cancel the
        // whole startup. Instead: create once when missing, adjust in place via collMod when the
        // retention changed (no rebuild), and drop only when retention is disabled.
        var existing = await collection.Indexes.ListAsync(cancellationToken).ConfigureAwait(false);
        var indexes = await existing.ToListAsync(cancellationToken).ConfigureAwait(false);
        var ttlIndexDoc = indexes.Find(
            i => i.GetValue("name", BsonString.Empty).AsString == TopicActivityTtlIndexName);

        if (!ttl.HasValue)
        {
            // Retention disabled: remove the TTL index if it is still present.
            if (ttlIndexDoc is not null)
            {
                await collection.Indexes.DropOneAsync(TopicActivityTtlIndexName, cancellationToken).ConfigureAwait(false);
            }
            return;
        }

        var desiredSeconds = (long)ttl.Value.TotalSeconds;

        if (ttlIndexDoc is null)
        {
            // First time only: this is the single index build (fast while the collection is small).
            var ttlIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending(FieldNames.Bucket),
                new CreateIndexOptions
                {
                    Name = TopicActivityTtlIndexName,
                    ExpireAfter = ttl.Value,
                });
            await collection.Indexes.CreateOneAsync(ttlIndex, cancellationToken: cancellationToken).ConfigureAwait(false);
            LogTtlApplied(logger, MeasurementNames.TopicActivity, ttl.Value, null);
            return;
        }

        // Index already exists — adjust expireAfterSeconds in place only when it actually changed.
        var currentSecondsValue = ttlIndexDoc.GetValue("expireAfterSeconds", BsonNull.Value);
        var currentSeconds = currentSecondsValue.IsNumeric ? (long)currentSecondsValue.ToDouble() : (long?)null;
        if (currentSeconds != desiredSeconds)
        {
            var command = new BsonDocument
            {
                { "collMod", MeasurementNames.TopicActivity },
                {
                    "index", new BsonDocument
                    {
                        { "name", TopicActivityTtlIndexName },
                        { "expireAfterSeconds", desiredSeconds },
                    }
                },
            };
            await database.RunCommandAsync<BsonDocument>(command, cancellationToken: cancellationToken).ConfigureAwait(false);
            LogTtlApplied(logger, MeasurementNames.TopicActivity, ttl.Value, null);
        }
    }
}
