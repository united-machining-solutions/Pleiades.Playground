using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api;

/// <summary>
/// MongoDB database context — defines available collections for the Events API.
/// </summary>
internal interface IEventsDbContext
{
    /// <summary>
    /// Notification events collection.
    /// </summary>
    IMongoCollection<NotificationEventDao> NotificationEvents { get; }
}
