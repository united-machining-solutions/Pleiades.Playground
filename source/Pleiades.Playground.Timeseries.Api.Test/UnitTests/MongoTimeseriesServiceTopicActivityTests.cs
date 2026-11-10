using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Services.MongoDb;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.UnitTests;

/// <summary>
/// Unit tests for the only non-trivial write-path logic inside <see cref="MongoTimeseriesService"/>:
/// the <c>topic_activity</c> companion-collection bookkeeping (per-minute de-duplication, the
/// in-memory guard, and its fail-soft / self-healing semantics). The MongoDB driver is substituted,
/// so these tests assert behaviour without a running database; the actual storage round-trip stays
/// in the integration tests.
/// </summary>
[TestClass]
public class MongoTimeseriesServiceTopicActivityTests
{
    private static readonly DateTime MinuteA = new(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime MinuteB = new(2024, 1, 1, 12, 1, 0, DateTimeKind.Utc);

    private static MongoTimeseriesService CreateService(out Mock<IMongoCollection<BsonDocument>> topicActivity)
    {
        var topicActivityCollection = new Mock<IMongoCollection<BsonDocument>>();

        var database = new Mock<IMongoDatabase>();
        database
            .Setup(d => d.GetCollection<BsonDocument>(It.IsAny<string>(), It.IsAny<MongoCollectionSettings>()))
            .Returns((string name, MongoCollectionSettings _) => name == MeasurementNames.TopicActivity
                ? topicActivityCollection.Object
                : new Mock<IMongoCollection<BsonDocument>>().Object);

        var settings = Options.Create(new MongoTimeseriesSettings
        {
            MaxQueryTimeSeconds = 30,
            TopicActivityCacheSize = 1000,
        });

        topicActivity = topicActivityCollection;
        return new MongoTimeseriesService(database.Object, settings, NullLogger<MongoTimeseriesService>.Instance);
    }

    private static void CaptureBulkWrite(
        Mock<IMongoCollection<BsonDocument>> topicActivity, Action<List<WriteModel<BsonDocument>>> capture)
    {
        topicActivity
            .Setup(c => c.BulkWriteAsync(
                It.IsAny<IEnumerable<WriteModel<BsonDocument>>>(),
                It.IsAny<BulkWriteOptions>(),
                It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<WriteModel<BsonDocument>>, BulkWriteOptions, CancellationToken>(
                (models, _, _) => capture([.. models]))
            .ReturnsAsync((BulkWriteResult<BsonDocument>)null!);
    }

    private static void ThrowOnBulkWrite(Mock<IMongoCollection<BsonDocument>> topicActivity)
    {
        topicActivity
            .Setup(c => c.BulkWriteAsync(
                It.IsAny<IEnumerable<WriteModel<BsonDocument>>>(),
                It.IsAny<BulkWriteOptions>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MongoException("topic_activity upsert failed"));
    }

    private static void AssertBulkWriteReceived(Mock<IMongoCollection<BsonDocument>> topicActivity, int times)
    {
        topicActivity.Verify(
            c => c.BulkWriteAsync(
                It.IsAny<IEnumerable<WriteModel<BsonDocument>>>(),
                It.IsAny<BulkWriteOptions>(),
                It.IsAny<CancellationToken>()),
            Times.Exactly(times));
    }

    private static Dictionary<string, BaseUnitSeriesRequestDto> BaseUnit(params (string Topic, DateTime[] Timestamps)[] topics)
    {
        var values = new Dictionary<string, BaseUnitSeriesRequestDto>();
        foreach (var (topic, timestamps) in topics)
        {
            var dto = new BaseUnitSeriesRequestDto();
            foreach (var timestamp in timestamps)
            {
                dto.DataPoints.Add(new DataPointDto<double> { Timestamp = timestamp, Value = 1.0 });
            }

            values[topic] = dto;
        }

        return values;
    }

    [TestMethod]
    public async Task AddAsync_MultipleSamplesInSameTopicAndMinute_CollapsesToOneUpsertPerMinute()
    {
        // Arrange
        using var service = CreateService(out var topicActivity);
        List<WriteModel<BsonDocument>>? captured = null;
        CaptureBulkWrite(topicActivity, models => captured = models);

        // t1: two samples in minute A + one in minute B; t2: one sample in minute A.
        // Expected distinct (topic, minute) pairs: (t1, A), (t1, B), (t2, A) => 3 upserts.
        var values = BaseUnit(
            ("plant/t1", [MinuteA.AddSeconds(5), MinuteA.AddSeconds(35), MinuteB.AddSeconds(10)]),
            ("plant/t2", [MinuteA.AddSeconds(50)]));

        // Act
        await service.AddAsync(values, TestContext.CancellationToken);

        // Assert
        Assert.IsNotNull(captured);
        Assert.HasCount(3, captured);
        foreach (var model in captured)
        {
            Assert.IsInstanceOfType<UpdateOneModel<BsonDocument>>(model);
            Assert.IsTrue(((UpdateOneModel<BsonDocument>)model).IsUpsert, "topic_activity writes must be idempotent upserts");
        }
    }

    [TestMethod]
    public async Task AddAsync_SecondBatchForSameTopicAndMinute_IsSuppressedByGuard()
    {
        // Arrange
        using var service = CreateService(out var topicActivity);

        // Act
        await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(5)])), TestContext.CancellationToken);
        // Different second-of-minute, but the same (type, topic, minute) bucket as the first call.
        await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(40)])), TestContext.CancellationToken);

        // Assert
        AssertBulkWriteReceived(topicActivity, 1);
    }

    [TestMethod]
    public async Task AddAsync_TopicActivityWriteFails_SwallowsErrorAndReturnsInsertCount()
    {
        // Arrange
        using var service = CreateService(out var topicActivity);
        ThrowOnBulkWrite(topicActivity);

        // Act
        var result = await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(5), MinuteB.AddSeconds(5)])), TestContext.CancellationToken);

        // Assert
        Assert.AreEqual(2, result.ValuesCount);
    }

    [TestMethod]
    public async Task AddAsync_TopicActivityWriteFails_LeavesGuardUnsetSoNextBatchRetries()
    {
        // Arrange
        using var service = CreateService(out var topicActivity);
        ThrowOnBulkWrite(topicActivity);

        // Act
        await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(5)])), TestContext.CancellationToken);
        await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(40)])), TestContext.CancellationToken);

        // Assert
        // The guard is populated only after a successful flush, so a failed upsert must be retried.
        AssertBulkWriteReceived(topicActivity, 2);
    }

    [TestMethod]
    public async Task AddAsync_SameTopicAndMinuteButDifferentValueType_AreNotSuppressedByGuard()
    {
        // Arrange
        using var service = CreateService(out var topicActivity);

        var stringValues = new Dictionary<string, StringSeriesRequestDto>
        {
            ["plant/t1"] = new StringSeriesRequestDto
            {
                DataPoints = { new DataPointDto<string> { Timestamp = MinuteA.AddSeconds(5), Value = "x" } },
            },
        };

        // Act
        await service.AddAsync(BaseUnit(("plant/t1", [MinuteA.AddSeconds(5)])), TestContext.CancellationToken);
        await service.AddAsync(stringValues, TestContext.CancellationToken);

        // Assert
        // Same topic + minute but a different value type => two independent upserts.
        AssertBulkWriteReceived(topicActivity, 2);
    }

    public TestContext TestContext { get; set; }
}
