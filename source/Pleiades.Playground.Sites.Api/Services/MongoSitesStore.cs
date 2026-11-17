using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// Keeps sites and placements in two MongoDB collections, each keyed by its id.
/// </summary>
internal sealed class MongoSitesStore(IMongoClient client, IOptions<MongoDbSettings> options) : ISitesStore
{
    private readonly IMongoCollection<SiteDao> _sites =
        client.GetDatabase(options.Value.DatabaseName).GetCollection<SiteDao>(options.Value.SiteCollection);

    private readonly IMongoCollection<PlacementDao> _placements =
        client.GetDatabase(options.Value.DatabaseName).GetCollection<PlacementDao>(options.Value.PlacementCollection);

    public async Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken) =>
        await _sites.Find(FilterDefinition<SiteDao>.Empty)
            .SortBy(s => s.SiteId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken) =>
        await _sites.Find(s => s.SiteId == siteId).FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

    public Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken) =>
        _sites.ReplaceOneAsync(s => s.SiteId == site.SiteId, site, new ReplaceOptions { IsUpsert = true }, cancellationToken);

    public async Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken)
    {
        var result = await _sites.DeleteOneAsync(s => s.SiteId == siteId, cancellationToken).ConfigureAwait(false);
        return result.DeletedCount > 0;
    }

    public async Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(string? siteId, CancellationToken cancellationToken)
    {
        var filter = siteId is null
            ? FilterDefinition<PlacementDao>.Empty
            : Builders<PlacementDao>.Filter.Eq(p => p.SiteId, siteId);
        return await _placements.Find(filter)
            .SortBy(p => p.SerialNumber)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<PlacementDao?> FindPlacementAsync(string serialNumber, CancellationToken cancellationToken) =>
        await _placements.Find(p => p.SerialNumber == serialNumber).FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

    public Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken) =>
        _placements.ReplaceOneAsync(
            p => p.SerialNumber == placement.SerialNumber, placement, new ReplaceOptions { IsUpsert = true }, cancellationToken);

    public async Task<bool> DeletePlacementAsync(string serialNumber, CancellationToken cancellationToken)
    {
        var result = await _placements.DeleteOneAsync(p => p.SerialNumber == serialNumber, cancellationToken).ConfigureAwait(false);
        return result.DeletedCount > 0;
    }
}
