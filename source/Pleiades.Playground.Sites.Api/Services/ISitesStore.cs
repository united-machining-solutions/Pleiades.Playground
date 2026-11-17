using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// Where sites and placements are kept. It stores and finds; the rules (a site exists before a machine is put
/// on it, a site with machines is not removed) are checked by the endpoints, inside
/// <see cref="InTransactionAsync{T}"/> so that a check still holds when its write lands.
/// </summary>
internal interface ISitesStore
{
    /// <summary>Every site, ordered by site id.</summary>
    Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken);

    /// <summary>Every placement, ordered by machine id.</summary>
    Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(CancellationToken cancellationToken);

    /// <summary>Removes the placement; <see langword="false"/> when there was none. Needs no check.</summary>
    Task<bool> DeletePlacementAsync(string machineId, CancellationToken cancellationToken);

    /// <summary>
    /// Runs <paramref name="work"/> as one transaction: it sees one state of the store, and either all of its
    /// writes land or none. When a concurrent transaction wrote a document this one writes too, the work runs
    /// again on the new state, so <paramref name="work"/> must do nothing but read and write the store.
    /// </summary>
    Task<T> InTransactionAsync<T>(Func<ISitesTransaction, CancellationToken, Task<T>> work, CancellationToken cancellationToken);
}

/// <summary>
/// The reads and writes of one transaction of <see cref="ISitesStore.InTransactionAsync{T}"/>.
/// </summary>
internal interface ISitesTransaction
{
    /// <summary>The site with this id, or <see langword="null"/>.</summary>
    Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>Creates the site or replaces the one with the same id.</summary>
    Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken);

    /// <summary>Removes the site; <see langword="false"/> when there was none.</summary>
    Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>
    /// Writes the site without changing what it says, so that a concurrent transaction that removes or changes
    /// the site conflicts with this one. A transaction that puts a machine on a site claims the site first:
    /// without the claim both would see their check pass and write different documents.
    /// </summary>
    Task ClaimSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>The placements of one site, ordered by machine id.</summary>
    Task<IReadOnlyList<PlacementDao>> ListPlacementsOfSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>The placement of this machine, or <see langword="null"/>.</summary>
    Task<PlacementDao?> FindPlacementAsync(string machineId, CancellationToken cancellationToken);

    /// <summary>Creates the placement or replaces the one of the same machine.</summary>
    Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken);
}
