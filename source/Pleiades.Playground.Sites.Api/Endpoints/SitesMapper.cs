using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// Turns stored documents into what REST and MCP return, so both return the same JSON.
/// </summary>
internal static class SitesMapper
{
    internal static SiteDtoV1 ToDto(SiteDao site) => new(site.SiteId, site.Company, site.Name, site.Halls);

    internal static PlacementDtoV1 ToDto(PlacementDao placement) =>
        new(placement.SerialNumber, placement.SiteId, placement.Hall, placement.DisplayName, placement.PlacedAt);

    internal static IReadOnlyList<SiteDtoV1> ToDtos(IEnumerable<SiteDao> sites) => [.. sites.Select(ToDto)];

    internal static IReadOnlyList<PlacementDtoV1> ToDtos(IEnumerable<PlacementDao> placements) => [.. placements.Select(ToDto)];
}
