using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// Keeps sites and placements in two MongoDB collections, each keyed by its id. Transactions need a replica set,
/// which the MongoDB of the stack is (<c>rs0</c>).
/// </summary>
internal sealed class MongoSitesStore(IMongoClient client, IOptions<MongoDbSettings> options) : ISitesStore
{
    // Snapshot reads, majority writes: a transaction sees one state, and a write conflict with a concurrent
    // transaction aborts it with a transient error, on which WithTransactionAsync runs the work again.
    private static readonly TransactionOptions Transaction = new(ReadConcern.Snapshot, writeConcern: WriteConcern.WMajority);

    private readonly IMongoCollection<SiteDao> _sites =
        client.GetDatabase(options.Value.DatabaseName).GetCollection<SiteDao>(options.Value.SiteCollection);

    private readonly IMongoCollection<PlacementDao> _placements =
        client.GetDatabase(options.Value.DatabaseName).GetCollection<PlacementDao>(options.Value.PlacementCollection);

    public async Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken) =>
        await _sites.Find(FilterDefinition<SiteDao>.Empty)
            .SortBy(s => s.SiteId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(CancellationToken cancellationToken) =>
        await _placements.Find(FilterDefinition<PlacementDao>.Empty)
            .SortBy(p => p.MachineId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task<bool> DeletePlacementAsync(string machineId, CancellationToken cancellationToken)
    {
        var result = await _placements.DeleteOneAsync(p => p.MachineId == machineId, cancellationToken).ConfigureAwait(false);
        return result.DeletedCount > 0;
    }

    public async Task<T> InTransactionAsync<T>(
        Func<ISitesTransaction, CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        using var session = await client.StartSessionAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        return await session.WithTransactionAsync(
            (s, token) => work(new MongoSitesTransaction(s, _sites, _placements), token),
            Transaction,
            cancellationToken).ConfigureAwait(false);
    }

    private sealed class MongoSitesTransaction(
        IClientSessionHandle session,
        IMongoCollection<SiteDao> sites,
        IMongoCollection<PlacementDao> placements) : ISitesTransaction
    {
        public async Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken) =>
            await sites.Find(session, s => s.SiteId == siteId).FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        public Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken) =>
            sites.ReplaceOneAsync(session, s => s.SiteId == site.SiteId, site, new ReplaceOptions { IsUpsert = true }, cancellationToken);

        public async Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken)
        {
            var result = await sites.DeleteOneAsync(session, s => s.SiteId == siteId, cancellationToken: cancellationToken).ConfigureAwait(false);
            return result.DeletedCount > 0;
        }

        public Task ClaimSiteAsync(string siteId, CancellationToken cancellationToken) =>
            sites.UpdateOneAsync(
                session,
                Builders<SiteDao>.Filter.Eq(s => s.SiteId, siteId),
                Builders<SiteDao>.Update.Inc(SiteDao.ClaimsElement, 1L),
                cancellationToken: cancellationToken);

        public async Task<IReadOnlyList<PlacementDao>> ListPlacementsOfSiteAsync(string siteId, CancellationToken cancellationToken) =>
            await placements.Find(session, p => p.SiteId == siteId)
                .SortBy(p => p.MachineId)
                .ToListAsync(cancellationToken).ConfigureAwait(false);

        public async Task<PlacementDao?> FindPlacementAsync(string machineId, CancellationToken cancellationToken) =>
            await placements.Find(session, p => p.MachineId == machineId).FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        public Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken) =>
            placements.ReplaceOneAsync(
                session, p => p.MachineId == placement.MachineId, placement, new ReplaceOptions { IsUpsert = true }, cancellationToken);
    }
}
