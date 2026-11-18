using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// Creates the index of the placements by site before the API accepts requests. An index is created only
/// when one of its name is missing, never dropped or rebuilt. The application does not start when this fails.
/// </summary>
internal sealed class MongoDbInitializer(
    IMongoClient client,
    IOptions<MongoDbSettings> options,
    ILogger<MongoDbInitializer> logger) : IHostedLifecycleService
{
    // The name keeps the word of the first version of this API, in which the machine id was called the serial
    // number: MongoDB refuses the same index under a second name, so a database that has it keeps starting.
    private const string PlacementSiteIndexName = "idx_siteid_serialnumber";

    private static readonly Action<ILogger, string, Exception?> LogIndexCreated =
        LoggerMessage.Define<string>(LogLevel.Information, new EventId(1, "IndexCreated"),
            "Created index on collection '{CollectionName}'");

    private static readonly Action<ILogger, Exception?> LogInitializationFailed =
        LoggerMessage.Define(LogLevel.Error, new EventId(2, "InitializationFailed"),
            "MongoDB initialization failed");

    private static readonly Action<ILogger, Exception?> LogInitializationSkipped =
        LoggerMessage.Define(LogLevel.Information, new EventId(3, "InitializationSkipped"),
            "MongoDB initialization skipped (EnsureIndexesOnStartup is disabled)");

    private readonly MongoDbSettings _settings = options.Value;

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
            var placements = client.GetDatabase(_settings.DatabaseName)
                .GetCollection<PlacementDao>(_settings.PlacementCollection);

            using var cursor = await placements.Indexes.ListAsync(linkedCts.Token).ConfigureAwait(false);
            var existing = await cursor.ToListAsync(linkedCts.Token).ConfigureAwait(false);
            if (existing.Exists(i => i.GetValue("name", BsonString.Empty).AsString == PlacementSiteIndexName))
            {
                return;
            }

            await placements.Indexes.CreateOneAsync(
                new CreateIndexModel<PlacementDao>(
                    Builders<PlacementDao>.IndexKeys.Ascending(p => p.SiteId).Ascending(p => p.MachineId),
                    new CreateIndexOptions { Name = PlacementSiteIndexName }),
                cancellationToken: linkedCts.Token).ConfigureAwait(false);
            LogIndexCreated(logger, _settings.PlacementCollection, null);
        }
        catch (Exception ex)
        {
            LogInitializationFailed(logger, ex);
            throw; // Fail fast: do not start without the index.
        }
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StoppingAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
