using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;
using Pleiades.Playground.Sites.Api.Endpoints;
using Pleiades.Playground.Sites.Api.Services;
using SitesEndpoints = Pleiades.Playground.Sites.Api.Endpoints.Sites;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// Two writes that race, against a real MongoDB replica set: one transaction stops right after its check, the
/// other runs to its end, then the first goes on. The first must conflict, run again and see the new state.
/// </summary>
/// <remarks>
/// Needs a MongoDB that runs as a replica set, named by <c>SITES_TEST_MONGODB_URL</c>, for example
/// <c>mongodb://127.0.0.1:27017/?directConnection=true</c> after
/// <c>docker run -d -p 127.0.0.1:27017:27017 mongo:8.0 --replSet rs0</c> and <c>rs.initiate()</c>. Without
/// it the tests are skipped. Each test works in a database of its own and drops it.
/// </remarks>
[TestClass]
public sealed class MongoSitesStoreRaceTests : IDisposable
{
    private static readonly SiteRequestV1 NorthPlant = new("Demo Manufacturing", "North plant", ["Hall 1", "Hall 2"]);

    public required TestContext TestContext { get; set; }

    private MongoClient? _client;
    private string _database = null!;
    private MongoSitesStore _store = null!;

    private CancellationToken Ct => TestContext.CancellationToken;

    [TestInitialize]
    public void Connect()
    {
        var url = Environment.GetEnvironmentVariable("SITES_TEST_MONGODB_URL");
        if (string.IsNullOrWhiteSpace(url))
        {
            Assert.Inconclusive("SITES_TEST_MONGODB_URL names no MongoDB replica set; the race tests need one.");
        }

        _client = new MongoClient(url);
        _database = "SitesRaceTest_" + Guid.NewGuid().ToString("N");
        _store = new MongoSitesStore(_client, Options.Create(new MongoDbSettings { ConnectionString = url, DatabaseName = _database }));
    }

    [TestCleanup]
    public async Task Drop()
    {
        if (_client is not null)
        {
            await _client.DropDatabaseAsync(_database, Ct);
        }
    }

    public void Dispose() => _client?.Dispose();

    [TestMethod]
    public async Task DeleteSite_WhileAMachineIsPutOnIt_IsRefused_AndBothStay()
    {
        await GivenSiteAsync();
        var paused = new PausingStore(_store, pauseAt: nameof(ISitesTransaction.ListPlacementsOfSiteAsync));

        var delete = SitesEndpoints.DeleteSite("north-plant", paused, Ct);
        await paused.Reached.WaitAsync(TimeSpan.FromSeconds(30), Ct);
        var put = await Placements.PutPlacement("M-05", new PlacementRequestV1("north-plant", "Hall 1", null), _store, TimeProvider.System, Ct);
        paused.Release();

        Assert.IsInstanceOfType<Created<PlacementDtoV1>>(put.Result);
        Assert.IsInstanceOfType<Conflict<string>>((await delete).Result);
        Assert.HasCount(1, await _store.ListSitesAsync(Ct));
        Assert.AreEqual("north-plant", (await _store.ListPlacementsAsync(Ct)).Single().SiteId);
    }

    [TestMethod]
    public async Task PutSite_DroppingAHallWhileAMachineIsPutInIt_IsRefused_AndTheHallStays()
    {
        await GivenSiteAsync();
        var paused = new PausingStore(_store, pauseAt: nameof(ISitesTransaction.ListPlacementsOfSiteAsync));

        var change = SitesEndpoints.PutSite("north-plant", NorthPlant with { Halls = ["Hall 1"] }, paused, Ct);
        await paused.Reached.WaitAsync(TimeSpan.FromSeconds(30), Ct);
        var put = await Placements.PutPlacement("M-05", new PlacementRequestV1("north-plant", "Hall 2", null), _store, TimeProvider.System, Ct);
        paused.Release();

        Assert.IsInstanceOfType<Created<PlacementDtoV1>>(put.Result);
        Assert.IsInstanceOfType<Conflict<string>>((await change).Result);
        Assert.AreEqual("Hall 1, Hall 2", string.Join(", ", (await _store.ListSitesAsync(Ct)).Single().Halls));
    }

    [TestMethod]
    public async Task PutPlacement_WhileItsSiteIsRemoved_IsRefused_AndNothingIsPlaced()
    {
        await GivenSiteAsync();
        var paused = new PausingStore(_store, pauseAt: nameof(ISitesTransaction.FindSiteAsync));

        var put = Placements.PutPlacement("M-05", new PlacementRequestV1("north-plant", "Hall 1", null), paused, TimeProvider.System, Ct);
        await paused.Reached.WaitAsync(TimeSpan.FromSeconds(30), Ct);
        var delete = await SitesEndpoints.DeleteSite("north-plant", _store, Ct);
        paused.Release();

        Assert.IsInstanceOfType<NoContent>(delete.Result);
        Assert.IsInstanceOfType<BadRequest<string>>((await put).Result);
        Assert.IsEmpty(await _store.ListSitesAsync(Ct));
        Assert.IsEmpty(await _store.ListPlacementsAsync(Ct));
    }

    private async Task GivenSiteAsync()
    {
        var created = await SitesEndpoints.PutSite("north-plant", NorthPlant, _store, Ct);
        Assert.IsInstanceOfType<Created<SiteDtoV1>>(created.Result);
    }

    /// <summary>
    /// The store, but the first transaction stops after its first call of one method until <see cref="Release"/>.
    /// A transaction that runs again does not stop.
    /// </summary>
    private sealed class PausingStore(ISitesStore inner, string pauseAt) : ISitesStore
    {
        private readonly TaskCompletionSource _reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _paused;

        public Task Reached => _reached.Task;

        public void Release() => _released.TrySetResult();

        public Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken) => inner.ListSitesAsync(cancellationToken);

        public Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(CancellationToken cancellationToken) => inner.ListPlacementsAsync(cancellationToken);

        public Task<bool> DeletePlacementAsync(string serialNumber, CancellationToken cancellationToken) =>
            inner.DeletePlacementAsync(serialNumber, cancellationToken);

        public Task<T> InTransactionAsync<T>(Func<ISitesTransaction, CancellationToken, Task<T>> work, CancellationToken cancellationToken) =>
            inner.InTransactionAsync((tx, token) => work(new PausingTransaction(tx, this), token), cancellationToken);

        private async Task<T> PauseAfter<T>(string method, Task<T> call)
        {
            var result = await call;
            if (method == pauseAt && Interlocked.Exchange(ref _paused, 1) == 0)
            {
                _reached.TrySetResult();
                await _released.Task;
            }

            return result;
        }

        private sealed class PausingTransaction(ISitesTransaction tx, PausingStore store) : ISitesTransaction
        {
            public Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken) =>
                store.PauseAfter(nameof(FindSiteAsync), tx.FindSiteAsync(siteId, cancellationToken));

            public Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken) => tx.SaveSiteAsync(site, cancellationToken);

            public Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken) => tx.DeleteSiteAsync(siteId, cancellationToken);

            public Task ClaimSiteAsync(string siteId, CancellationToken cancellationToken) => tx.ClaimSiteAsync(siteId, cancellationToken);

            public Task<IReadOnlyList<PlacementDao>> ListPlacementsOfSiteAsync(string siteId, CancellationToken cancellationToken) =>
                store.PauseAfter(nameof(ListPlacementsOfSiteAsync), tx.ListPlacementsOfSiteAsync(siteId, cancellationToken));

            public Task<PlacementDao?> FindPlacementAsync(string serialNumber, CancellationToken cancellationToken) =>
                tx.FindPlacementAsync(serialNumber, cancellationToken);

            public Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken) =>
                tx.SavePlacementAsync(placement, cancellationToken);
        }
    }
}
