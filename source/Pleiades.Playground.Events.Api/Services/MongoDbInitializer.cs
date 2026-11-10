using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Services;

/// <summary>
/// Hosted lifecycle service that ensures MongoDB indexes exist on startup.
/// No index — structural or TTL — is ever unconditionally dropped and rebuilt: structural
/// indexes are created only when missing (by name); the TTL index is reconciled against
/// DataRetentionPeriod (created when missing, adjusted in place via <c>collMod</c> when the
/// retention changed, dropped only when retention is removed) and is applied to existing
/// collections too. Uses fail-fast semantics — the application will not start if index creation fails.
/// </summary>
internal sealed class MongoDbInitializer(
    IMongoClient client,
    IOptions<MongoDbSettings> options,
    ILogger<MongoDbInitializer> logger) : IHostedLifecycleService
{
    #region LoggerMessages

    private static readonly Action<ILogger, int, string, Exception?> LogIndexesEnsured =
        LoggerMessage.Define<int, string>(LogLevel.Information, new EventId(1, "IndexesEnsured"),
            "Ensured {Count} index(es) on collection '{CollectionName}'");

    private static readonly Action<ILogger, Exception?> LogInitializationComplete =
        LoggerMessage.Define(LogLevel.Information, new EventId(2, "InitializationComplete"),
            "MongoDB initialization completed successfully");

    private static readonly Action<ILogger, Exception?> LogInitializationFailed =
        LoggerMessage.Define(LogLevel.Error, new EventId(3, "InitializationFailed"),
            "MongoDB initialization failed");

    private static readonly Action<ILogger, Exception?> LogInitializationSkipped =
        LoggerMessage.Define(LogLevel.Information, new EventId(4, "InitializationSkipped"),
            "MongoDB initialization skipped (EnsureIndexesOnStartup is disabled)");

    private static readonly Action<ILogger, string, TimeSpan, Exception?> LogTtlIndexCreated =
        LoggerMessage.Define<string, TimeSpan>(LogLevel.Information, new EventId(5, "TtlIndexCreated"),
            "Created TTL index on '{CollectionName}' with retention period of {Period}");

    private static readonly Action<ILogger, string, TimeSpan, Exception?> LogTtlIndexUpdated =
        LoggerMessage.Define<string, TimeSpan>(LogLevel.Information, new EventId(6, "TtlIndexUpdated"),
            "Updated TTL index on '{CollectionName}' to retention period of {Period} (in place, no rebuild)");

    private static readonly Action<ILogger, string, Exception?> LogTtlIndexRemoved =
        LoggerMessage.Define<string>(LogLevel.Information, new EventId(7, "TtlIndexRemoved"),
            "Removed TTL index from '{CollectionName}' (DataRetentionPeriod not configured)");

    #endregion

    private const string TtlIndexName = "idx_ttl";

    private readonly MongoDbSettings _settings = options.Value;

    /// <summary>
    /// Creates all required indexes before the application starts accepting requests.
    /// </summary>
    public async Task StartingAsync(CancellationToken cancellationToken)
    {
        if (!_settings.EnsureIndexesOnStartup)
        {
            LogInitializationSkipped(logger, null);
            return;
        }

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            var database = client.GetDatabase(_settings.DatabaseName);

            await InitializeNotificationEventCollectionAsync(database, linkedCts.Token).ConfigureAwait(false);

            // The TTL index is reconciled against retention (applied to an existing collection too),
            // so a changed/removed DataRetentionPeriod is honored every boot — without a rebuild.
            await EnsureTtlIndexesAsync(database, linkedCts.Token).ConfigureAwait(false);

            LogInitializationComplete(logger, null);
        }
        catch (Exception ex)
        {
            LogInitializationFailed(logger, ex);
            throw; // Fail-fast — don't start without indexes
        }
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StoppingAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task InitializeNotificationEventCollectionAsync(
        IMongoDatabase database, CancellationToken cancellationToken)
    {
        var collectionName = _settings.NotificationEventCollection;
        var collection = database.GetCollection<NotificationEventDao>(collectionName);

        var indexes = new List<CreateIndexModel<NotificationEventDao>>
        {
            new(Builders<NotificationEventDao>.IndexKeys
                    .Ascending(e => e.Action)
                    .Ascending(e => e.MId)
                    .Ascending(e => e.Level)
                    .Descending(e => e.Timestamp),
                new CreateIndexOptions { Name = "idx_action_mid_level_timestamp" }),

            new(Builders<NotificationEventDao>.IndexKeys
                    .Ascending(e => e.NotificationId)
                    .Descending(e => e.Timestamp),
                new CreateIndexOptions { Name = "idx_notificationid_timestamp" }),

            new(Builders<NotificationEventDao>.IndexKeys
                    .Ascending(e => e.CorrelationId),
                new CreateIndexOptions { Name = "idx_correlationid" })
        };

        await EnsureIndexesAsync(collection, indexes, cancellationToken).ConfigureAwait(false);
        LogIndexesEnsured(logger, indexes.Count, collectionName, null);
    }

    // ── Structural indexes: create only what is missing, never drop ──────────────────

    /// <summary>
    /// Creates only the indexes whose name does not yet exist on the collection. An already
    /// present index is never dropped or rebuilt. Idempotent; in steady state a single ListIndexes.
    /// A name-clashing index with a changed specification (a real migration) is left untouched on
    /// purpose — deliberate migrations run separately, never automatically on every boot.
    /// </summary>
    private static async Task EnsureIndexesAsync<T>(
        IMongoCollection<T> collection,
        IReadOnlyList<CreateIndexModel<T>> models,
        CancellationToken cancellationToken)
    {
        using var cursor = await collection.Indexes.ListAsync(cancellationToken).ConfigureAwait(false);
        var existing = await cursor.ToListAsync(cancellationToken).ConfigureAwait(false);
        var existingNames = existing
            .Select(i => i.GetValue("name", BsonString.Empty).AsString)
            .ToHashSet(StringComparer.Ordinal);

        var missing = models
            .Where(m => m.Options?.Name is { } name && !existingNames.Contains(name))
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        await collection.Indexes.CreateManyAsync(missing, cancellationToken).ConfigureAwait(false);
    }

    // ── TTL indexes: reconcile by retention, never drop-and-rebuild ──────────────────

    /// <summary>
    /// Reconciles the retention TTL index on the event collection, regardless of collection
    /// existence, so a changed/removed <see cref="MongoDbSettings.DataRetentionPeriod"/> is honored.
    /// </summary>
    private async Task EnsureTtlIndexesAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var retention = _settings.DataRetentionPeriod;

        await ApplyTtlAsync(
            database.GetCollection<NotificationEventDao>(_settings.NotificationEventCollection),
            Builders<NotificationEventDao>.IndexKeys.Ascending(e => e.Timestamp),
            _settings.NotificationEventCollection, retention, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Reconciles the TTL index without ever dropping-and-rebuilding: creates it when missing,
    /// updates a changed retention in place via <c>collMod</c> (<c>expireAfterSeconds</c>), and
    /// drops it only when retention is disabled (<c>null</c>). The previous drop-then-recreate ran
    /// on every boot and could exceed the 30 s init budget on a large collection.
    /// </summary>
    private async Task ApplyTtlAsync<T>(
        IMongoCollection<T> collection,
        IndexKeysDefinition<T> ttlKeys,
        string collectionName,
        TimeSpan? retention,
        CancellationToken cancellationToken)
    {
        using var cursor = await collection.Indexes.ListAsync(cancellationToken).ConfigureAwait(false);
        var indexes = await cursor.ToListAsync(cancellationToken).ConfigureAwait(false);
        var existing = indexes.Find(i => i.GetValue("name", BsonString.Empty).AsString == TtlIndexName);

        if (!retention.HasValue)
        {
            // Retention disabled: remove the TTL index if it is still present (cheap, no rebuild).
            if (existing is not null)
            {
                await collection.Indexes.DropOneAsync(TtlIndexName, cancellationToken).ConfigureAwait(false);
                LogTtlIndexRemoved(logger, collectionName, null);
            }
            return;
        }

        var desiredSeconds = (long)retention.Value.TotalSeconds;

        if (existing is null)
        {
            await collection.Indexes.CreateOneAsync(
                new CreateIndexModel<T>(ttlKeys, new CreateIndexOptions { Name = TtlIndexName, ExpireAfter = retention.Value }),
                cancellationToken: cancellationToken).ConfigureAwait(false);
            LogTtlIndexCreated(logger, collectionName, retention.Value, null);
            return;
        }

        // Index exists — adjust expireAfterSeconds in place only when it actually changed.
        var current = existing.GetValue("expireAfterSeconds", BsonNull.Value);
        var currentSeconds = current.IsNumeric ? (long)current.ToDouble() : (long?)null;
        if (currentSeconds != desiredSeconds)
        {
            var command = new BsonDocument
            {
                { "collMod", collectionName },
                {
                    "index", new BsonDocument
                    {
                        { "name", TtlIndexName },
                        { "expireAfterSeconds", desiredSeconds },
                    }
                },
            };
            await collection.Database
                .RunCommandAsync<BsonDocument>(command, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
            LogTtlIndexUpdated(logger, collectionName, retention.Value, null);
        }
    }
}
