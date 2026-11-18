using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// The store in memory, keyed like the MongoDB collections: one site per site id, one placement per machine
/// id. A transaction holds a lock, so transactions run one after the other; the conflicts of concurrent
/// transactions in MongoDB are covered by <see cref="MongoSitesStoreRaceTests"/>.
/// </summary>
internal sealed class InMemorySitesStore : ISitesStore, ISitesTransaction, IDisposable
{
    private readonly Dictionary<string, SiteDao> _sites = new(StringComparer.Ordinal);
    private readonly Dictionary<string, PlacementDao> _placements = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _transaction = new(1, 1);

    public Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult<IReadOnlyList<SiteDao>>([.. _sites.Values.OrderBy(s => s.SiteId, StringComparer.Ordinal)]);
        }
    }

    public Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult<IReadOnlyList<PlacementDao>>([.. _placements.Values.OrderBy(p => p.MachineId, StringComparer.Ordinal)]);
        }
    }

    public Task<bool> DeletePlacementAsync(string machineId, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult(_placements.Remove(machineId));
        }
    }

    public async Task<T> InTransactionAsync<T>(Func<ISitesTransaction, CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        await _transaction.WaitAsync(cancellationToken);
        try
        {
            return await work(this, cancellationToken);
        }
        finally
        {
            _transaction.Release();
        }
    }

    public Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult(_sites.GetValueOrDefault(siteId));
        }
    }

    public Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            _sites[site.SiteId] = site;
        }

        return Task.CompletedTask;
    }

    public Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult(_sites.Remove(siteId));
        }
    }

    public Task ClaimSiteAsync(string siteId, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<IReadOnlyList<PlacementDao>> ListPlacementsOfSiteAsync(string siteId, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult<IReadOnlyList<PlacementDao>>(
                [.. _placements.Values.Where(p => p.SiteId == siteId).OrderBy(p => p.MachineId, StringComparer.Ordinal)]);
        }
    }

    public Task<PlacementDao?> FindPlacementAsync(string machineId, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            return Task.FromResult(_placements.GetValueOrDefault(machineId));
        }
    }

    public Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken)
    {
        lock (_sites)
        {
            _placements[placement.MachineId] = placement;
        }

        return Task.CompletedTask;
    }

    public void Dispose() => _transaction.Dispose();
}
