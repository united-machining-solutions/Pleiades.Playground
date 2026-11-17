using Pleiades.Playground.Sites.Api.DataAccessObjects;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// Where sites and placements are kept. It stores and finds; the rules (a site exists before a machine is put
/// on it, a site with machines is not removed) are checked by the endpoints.
/// </summary>
internal interface ISitesStore
{
    /// <summary>Every site, ordered by site id.</summary>
    Task<IReadOnlyList<SiteDao>> ListSitesAsync(CancellationToken cancellationToken);

    /// <summary>The site with this id, or <see langword="null"/>.</summary>
    Task<SiteDao?> FindSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>Creates the site or replaces the one with the same id.</summary>
    Task SaveSiteAsync(SiteDao site, CancellationToken cancellationToken);

    /// <summary>Removes the site; <see langword="false"/> when there was none.</summary>
    Task<bool> DeleteSiteAsync(string siteId, CancellationToken cancellationToken);

    /// <summary>Every placement, or those of one site, ordered by serial number.</summary>
    Task<IReadOnlyList<PlacementDao>> ListPlacementsAsync(string? siteId, CancellationToken cancellationToken);

    /// <summary>The placement of this machine, or <see langword="null"/>.</summary>
    Task<PlacementDao?> FindPlacementAsync(string serialNumber, CancellationToken cancellationToken);

    /// <summary>Creates the placement or replaces the one of the same machine.</summary>
    Task SavePlacementAsync(PlacementDao placement, CancellationToken cancellationToken);

    /// <summary>Removes the placement; <see langword="false"/> when there was none.</summary>
    Task<bool> DeletePlacementAsync(string serialNumber, CancellationToken cancellationToken);
}
