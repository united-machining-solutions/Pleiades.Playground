using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Pleiades.Playground.HealthChecks.MongoDb.Test;

[TestClass]
public class MongoDbHealthCheckTest
{
    private readonly Mock<IMongoClient> _client;
    private readonly Mock<IMongoDatabase> _database;
    private readonly IOptions<MongoDbHealthCheckOptions> _options;
    private readonly MongoDbHealthCheck _healthCheck;

    public required TestContext TestContext { get; set; }

    public MongoDbHealthCheckTest()
    {
        _client = new Mock<IMongoClient>();
        _database = new Mock<IMongoDatabase>();
        _options = Options.Create(new MongoDbHealthCheckOptions { Timeout = TimeSpan.FromSeconds(3) });

        _client.Setup(c => c.GetDatabase("admin", null)).Returns(_database.Object);

        _healthCheck = new MongoDbHealthCheck(_client.Object, _options);
    }

    [TestMethod]
    public async Task CheckHealthAsync_PingSucceeds_ReturnsHealthy()
    {
        _database
            .Setup(d => d.RunCommandAsync<BsonDocument>(
                It.IsAny<Command<BsonDocument>>(),
                It.IsAny<ReadPreference>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BsonDocument("ok", 1));

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.AreEqual("MongoDB is reachable.", result.Description);
    }

    [TestMethod]
    public async Task CheckHealthAsync_PingThrowsMongoException_ReturnsUnhealthy()
    {
        _database
            .Setup(d => d.RunCommandAsync<BsonDocument>(
                It.IsAny<Command<BsonDocument>>(),
                It.IsAny<ReadPreference>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MongoException("connection failed"));

        var result = await _healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual("MongoDB is unreachable.", result.Description);
        Assert.IsNotNull(result.Exception);
    }

    [TestMethod]
    public async Task CheckHealthAsync_Timeout_ReturnsUnhealthy()
    {
        var shortTimeoutOptions = Options.Create(new MongoDbHealthCheckOptions { Timeout = TimeSpan.FromMilliseconds(50) });
        var healthCheck = new MongoDbHealthCheck(_client.Object, shortTimeoutOptions);

        _database
            .Setup(d => d.RunCommandAsync<BsonDocument>(
                It.IsAny<Command<BsonDocument>>(),
                It.IsAny<ReadPreference>(),
                It.IsAny<CancellationToken>()))
            .Returns<Command<BsonDocument>, ReadPreference, CancellationToken>(async (_, _, ct) =>
            {
                await Task.Delay(TimeSpan.FromSeconds(5), ct);
                return new BsonDocument("ok", 1);
            });

        var result = await healthCheck.CheckHealthAsync(new HealthCheckContext(), TestContext.CancellationToken);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.Contains("timed out", result.Description!, StringComparison.Ordinal);
    }
}
