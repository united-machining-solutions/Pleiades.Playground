using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using Moq;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Services.MongoDb;
using Pleiades.Playground.Timeseries.Common.Exceptions;

namespace Pleiades.Playground.Timeseries.Api.Test.UnitTests;

/// <summary>
/// Deleting the values of a machine: every value collection and <c>topic_activity</c> are filtered by an
/// anchored, escaped prefix of the topic, and the counts of the value collections add up. The MongoDB driver
/// is substituted.
/// </summary>
[TestClass]
public class MongoTimeseriesServiceDeleteTests
{
    private static readonly string[] ValueCollections =
        [MeasurementNames.BaseUnitValues, MeasurementNames.StringValues, MeasurementNames.BooleanValues];

    private static MongoTimeseriesService CreateService(Dictionary<string, Mock<IMongoCollection<BsonDocument>>> collections)
    {
        var database = new Mock<IMongoDatabase>();
        database
            .Setup(d => d.GetCollection<BsonDocument>(It.IsAny<string>(), It.IsAny<MongoCollectionSettings>()))
            .Returns((string name, MongoCollectionSettings _) =>
            {
                if (!collections.TryGetValue(name, out var collection))
                {
                    collection = new Mock<IMongoCollection<BsonDocument>>();
                    collections[name] = collection;
                }

                return collection.Object;
            });

        var settings = Options.Create(new MongoTimeseriesSettings { MaxQueryTimeSeconds = 30, TopicActivityCacheSize = 1000 });
        return new MongoTimeseriesService(database.Object, settings, NullLogger<MongoTimeseriesService>.Instance);
    }

    private static BsonDocument Render(FilterDefinition<BsonDocument> filter) =>
        filter.Render(new RenderArgs<BsonDocument>(BsonSerializer.LookupSerializer<BsonDocument>(), BsonSerializer.SerializerRegistry));

    private static Mock<IMongoCollection<BsonDocument>> Deleting(long count, List<BsonDocument> filters)
    {
        var collection = new Mock<IMongoCollection<BsonDocument>>();
        collection
            .Setup(c => c.DeleteManyAsync(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<CancellationToken>()))
            .Callback<FilterDefinition<BsonDocument>, CancellationToken>((filter, _) => filters.Add(Render(filter)))
            .ReturnsAsync(new DeleteResult.Acknowledged(count));
        return collection;
    }

    [TestMethod]
    public async Task DeletesTheTopicsBelowThePrefixInEveryCollectionAndAddsUpTheValues()
    {
        var filters = new List<BsonDocument>();
        var collections = new Dictionary<string, Mock<IMongoCollection<BsonDocument>>>
        {
            [MeasurementNames.BaseUnitValues] = Deleting(5, filters),
            [MeasurementNames.StringValues] = Deleting(2, filters),
            [MeasurementNames.BooleanValues] = Deleting(1, filters),
            [MeasurementNames.TopicActivity] = Deleting(40, filters),
        };
        using var service = CreateService(collections);

        var result = await service.DeleteByTopicPrefixAsync("machines/Line 2?/", TestContext.CancellationToken);

        Assert.AreEqual(8, result.ValuesCount, "topic_activity is bookkeeping, not values");
        Assert.HasCount(4, filters);
        foreach (var name in ValueCollections.Append(MeasurementNames.TopicActivity))
        {
            collections[name].Verify(c => c.DeleteManyAsync(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<CancellationToken>()), Times.Once);
        }

        // A literal prefix: the space and the question mark of the serial number are escaped, the start is anchored.
        foreach (var filter in filters.Take(3))
        {
            Assert.AreEqual(@"^machines/Line\ 2\?/", filter["meta.topic"].AsBsonRegularExpression.Pattern);
        }

        Assert.AreEqual(@"^machines/Line\ 2\?/", filters[3]["topic"].AsBsonRegularExpression.Pattern);
    }

    [TestMethod]
    public async Task AnEmptyPrefixIsRefused()
    {
        using var service = CreateService([]);
        await Assert.ThrowsExactlyAsync<ArgumentException>(() => service.DeleteByTopicPrefixAsync("", TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task AFailedDeleteIsAWriteError()
    {
        var failing = new Mock<IMongoCollection<BsonDocument>>();
        failing
            .Setup(c => c.DeleteManyAsync(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MongoException("delete failed"));
        using var service = CreateService(new() { [MeasurementNames.BaseUnitValues] = failing });

        await Assert.ThrowsExactlyAsync<PleiadesWriteException>(() => service.DeleteByTopicPrefixAsync("machines/P-04/", TestContext.CancellationToken));
    }

    public TestContext TestContext { get; set; } = null!;
}
