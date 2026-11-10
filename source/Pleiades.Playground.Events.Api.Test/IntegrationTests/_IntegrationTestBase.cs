using MongoDB.Bson;
using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

[TestClass]
public class IntegrationTestBase
{
    public bool Dummy { get; }

    public static bool Containerized { get; private set; }

    public static Uri BaseUrl { get; set; } = new("http://localhost/");

    internal static NotificationEventDao NotificationTestEvent { get; } = new()
    {
        Id = ObjectId.GenerateNewId().ToString(),
        MId = "2012-2012",
        NotificationId = "123456",
    };

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

            var notificationEventCollection = mongoDatabase.GetCollection<NotificationEventDao>("NotificationEvent");

            notificationEventCollection.InsertOneAsync(NotificationTestEvent, cancellationToken: testContext.CancellationToken).ConfigureAwait(false).GetAwaiter().GetResult();
        }
    }
}
