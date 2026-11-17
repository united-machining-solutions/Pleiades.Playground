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

    /// <summary>
    /// Job events collection: job orders and their results.
    /// </summary>
    IMongoCollection<JobEventDao> JobEvents { get; }

    /// <summary>
    /// Work master events collection: program executions.
    /// </summary>
    IMongoCollection<WorkMasterEventDao> WorkMasterEvents { get; }
}
