using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

[TestClass]
public class IntegrationTestBase
{
    public bool Dummy { get; }

    public static bool Containerized { get; private set; }

    public static Uri BaseUrl { get; set; } = new("http://localhost/");

    [AssemblyInitialize]
    public static void IntegrationTestInitialize(TestContext testContext)
    {
        ArgumentNullException.ThrowIfNull(testContext);

        var apiUrl = Environment.GetEnvironmentVariable("API_URL");
        if (apiUrl != null)
        {
            Containerized = true;
            BaseUrl = new(apiUrl);

            using var mongoClient = new MongoClient(Environment.GetEnvironmentVariable("MONGODB_URL") ?? "mongodb://localhost:27017");
            var mongoDatabase = mongoClient.GetDatabase("Events");

            // One shift of one machine; a second run finds it stored and skips it.
            var machineEvents = mongoDatabase.GetCollection<MachineEventDao>("MachineEvent");
            foreach (var stored in MachineEventSamples.StoredShift())
            {
                machineEvents.ReplaceOne(Builders<MachineEventDao>.Filter.Eq(e => e.Key, stored.Key), stored,
                    new ReplaceOptions { IsUpsert = true }, testContext.CancellationToken);
            }
        }
    }
}
