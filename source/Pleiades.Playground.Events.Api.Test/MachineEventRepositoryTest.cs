// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;
using Pleiades.Playground.Events.Api.Services;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>
/// The reads of the views against a MongoDB: the aggregations answer as the in-memory reads of
/// <see cref="StoredEvents"/>, which the endpoint tests stand on. Each test writes a collection of its own and drops
/// it. It needs a MongoDB in <c>EVENTS_TEST_MONGODB_URL</c> (for example <c>mongodb://localhost:27017</c>) and is
/// skipped without one.
/// </summary>
[TestClass]
public sealed class MachineEventRepositoryTest
{
    private const string EnvironmentVariable = "EVENTS_TEST_MONGODB_URL";
    private const string OtherMachine = "taygeta-precision_TP-800_P-07";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task Runs_AndCounts_AreThoseOfTheStoredEvents()
    {
        await using var store = await Store.CreateAsync(Events(), TestContext.CancellationToken);

        var runs = await store.Repository.FindRunsAsync(new MachineEventFilter(), TestContext.CancellationToken);
        var counts = await store.Repository.FindCountsAsync(
            new MachineEventFilter(MachineEventSamples.MachineId, "Notification"), MachineEventSamples.Prefix, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(MachineEventViews.Runs(store.Stored), runs);
        CollectionAssert.AreEquivalent(
            store.Stored.Where(e => e.MId == MachineEventSamples.MachineId && e.Group == "Notification").Select(e => e.SequenceCount!.Value).ToList(),
            counts);
        Assert.IsFalse(runs.Single(r => r.MId == OtherMachine).IsComplete, "the other machine misses its count 2");
    }

    [TestMethod]
    public async Task OpenAlertEvents_AreTheEventsOfTheAlertsNotCleared()
    {
        await using var store = await Store.CreateAsync(Events(), TestContext.CancellationToken);

        var all = await store.Repository.FindOpenAlertEventsAsync(null, TestContext.CancellationToken);
        var one = await store.Repository.FindOpenAlertEventsAsync(OtherMachine, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(StoredEvents.OpenAlertEvents(store.Stored, null).Select(e => e.Key).ToList(), all.Select(e => e.Key).ToList());
        CollectionAssert.AreEquivalent(StoredEvents.OpenAlertEvents(store.Stored, OtherMachine).Select(e => e.Key).ToList(), one.Select(e => e.Key).ToList());
        Assert.IsTrue(all.All(e => e.Event is null), "the CloudEvent as it came is not read for a view");
    }

    [TestMethod]
    public async Task AViewRead_IsOldestFirst_WithoutTheCloudEvent_AndNotTruncated()
    {
        await using var store = await Store.CreateAsync(Events(), TestContext.CancellationToken);

        var read = await store.Repository.FindForViewAsync(new MachineEventFilter(MachineEventSamples.MachineId), TestContext.CancellationToken);

        Assert.IsFalse(read.Truncated);
        Assert.HasCount(store.Stored.Count(e => e.MId == MachineEventSamples.MachineId), read.Items);
        CollectionAssert.AreEqual(read.Items.OrderBy(e => e.Time).Select(e => e.Key).ToList(), read.Items.Select(e => e.Key).ToList());
        Assert.IsTrue(read.Items.All(e => e.Event is null && e.Data is not null));
    }

    /// <summary>The shift of the samples, and on a second machine an alert that stands, one cleared, and a lost count 2.</summary>
    private static List<MachineEventDao> Events()
    {
        static JsonObject Alert(string id) => new() { ["Id"] = id, ["ErrorCode"] = "1", ["Severity"] = "OffSpec", ["Time"] = "2026-11-17T06:00:00Z" };
        var other = new[]
        {
            MachineEventSamples.CloudEvent(MachineEventViews.AlertRaised, 1, 1, Alert("b-1"), id: "o-1"),
            MachineEventSamples.CloudEvent(MachineEventViews.AlertRaised, 3, 3, Alert("b-2"), id: "o-3"),
            MachineEventSamples.CloudEvent(MachineEventViews.AlertCleared, 4, 4, Alert("b-2"), id: "o-4"),
        }.Select(e => MachineEventMapper.ToDao(OtherMachine, e, MachineEventSamples.Start)).ToList();
        return [.. MachineEventSamples.StoredShift(), .. other];
    }

    private sealed class Store : IAsyncDisposable
    {
        private readonly MongoClient _client;
        private readonly IMongoDatabase _database;
        private readonly string _collection;

        private Store(MongoClient client, IMongoDatabase database, string collection, List<MachineEventDao> stored)
        {
            _client = client;
            _database = database;
            _collection = collection;
            Stored = stored;
            var settings = Options.Create(new MongoDbSettings
            {
                ConnectionString = client.Settings.Server.ToString(),
                DatabaseName = database.DatabaseNamespace.DatabaseName,
                MachineEventCollection = collection,
            });
            Repository = new MachineEventRepository(new EventsDbContext(client, settings), NullLogger<MachineEventRepository>.Instance);
        }

        public List<MachineEventDao> Stored { get; }

        public MachineEventRepository Repository { get; }

        public static async Task<Store> CreateAsync(List<MachineEventDao> stored, CancellationToken cancellationToken)
        {
            var url = Environment.GetEnvironmentVariable(EnvironmentVariable);
            if (string.IsNullOrEmpty(url))
            {
                Assert.Inconclusive($"No MongoDB: set {EnvironmentVariable} to run the reads against one.");
            }
            var client = new MongoClient(url);
            var database = client.GetDatabase("EventsTest");
            var collection = $"MachineEvent_{Guid.NewGuid():N}";
            await database.GetCollection<MachineEventDao>(collection).InsertManyAsync(stored, cancellationToken: cancellationToken);
            return new Store(client, database, collection, stored);
        }

        public async ValueTask DisposeAsync()
        {
            await _database.DropCollectionAsync(_collection);
            _client.Dispose();
        }
    }
}
