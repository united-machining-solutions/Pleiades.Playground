using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api;

/// <summary>
/// MongoDB database context — defines available collections for the Events API.
/// </summary>
internal interface IEventsDbContext
{
    /// <summary>
    /// The CloudEvents of machines, stored as they came.
    /// </summary>
    IMongoCollection<MachineEventDao> MachineEvents { get; }
}
