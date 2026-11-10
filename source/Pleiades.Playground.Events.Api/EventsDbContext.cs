using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Services;

namespace Pleiades.Playground.Events.Api;

/// <summary>
/// MongoDB database context — provides typed collection access for the Events API.
/// </summary>
/// <param name="client">The MongoDB client provided via DI.</param>
/// <param name="options">MongoDB configuration.</param>
internal sealed class EventsDbContext(IMongoClient client, IOptions<MongoDbSettings> options) : IEventsDbContext
{
    private readonly MongoDbSettings _settings = options.Value;
    private readonly IMongoDatabase _database = client.GetDatabase(options.Value.DatabaseName);

    /// <inheritdoc />
    public IMongoCollection<NotificationEventDao> NotificationEvents
        => _database.GetCollection<NotificationEventDao>(_settings.NotificationEventCollection);
}
