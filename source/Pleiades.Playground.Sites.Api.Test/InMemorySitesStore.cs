using System.Collections.Concurrent;
using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// The store in memory, keyed like the MongoDB collections: one site per site id, one placement per serial number.
/// </summary>
internal sealed class InMemorySitesStore : ISitesStore
{
    private readonly ConcurrentDictionary<string, SiteDao> _sites = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, PlacementDao> _placements = new(StringComparer.Ordinal);

    public Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<SiteDao>>([.. _sites.Values.OrderBy(s => s.SiteId, StringComparer.Ordinal)]);

    public Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken) =>
        Task.FromResult(_sites.GetValueOrDefault(siteId));

    public Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken)
    {
        _sites[site.SiteId] = site;
        return Task.CompletedTask;
    }

    public Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken) =>
        Task.FromResult(_sites.TryRemove(siteId, out _));

    public Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(string? siteId, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<PlacementDao>>(
            [.. _placements.Values.Where(p => siteId is null || p.SiteId == siteId).OrderBy(p => p.SerialNumber, StringComparer.Ordinal)]);

    public Task<PlacementDao?> FindPlacementAsync(string serialNumber, CancellationToken cancellationToken) =>
        Task.FromResult(_placements.GetValueOrDefault(serialNumber));

    public Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken)
    {
        _placements[placement.SerialNumber] = placement;
        return Task.CompletedTask;
    }

    public Task<bool> DeletePlacementAsync(string serialNumber, CancellationToken cancellationToken) =>
        Task.FromResult(_placements.TryRemove(serialNumber, out _));
}
