using System.ComponentModel;
using ModelContextProtocol.Server;
using Pleiades.Playground.Sites.Api.DataTransferObjects;
using Pleiades.Playground.Sites.Api.Endpoints;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.McpTools;

/// <summary>
/// The read-only tools of the Sites API. They return the same JSON as <c>GET /sites</c> and
/// <c>GET /placements</c>. No tool writes: a language model cannot place or remove a machine.
/// </summary>
[McpServerToolType]
internal sealed class SitesTools(ISitesStore store)
{
    [McpServerTool(Name = "sites_site_list", ReadOnly = true),
     Description(
         "List every site, ordered by siteId. A site is a place with a company, a plant (name) and its halls. " +
         "The siteId is the {SiteId} of the MQTT topics sites/{SiteId}/..., so values about the place share the key.")]
    public async Task<IReadOnlyList<SiteDtoV1>> ListSites(CancellationToken cancellationToken = default)
    {
        var sites = await store.ListSitesAsync(cancellationToken).ConfigureAwait(false);
        return SitesMapper.ToDtos(sites);
    }

    [McpServerTool(Name = "sites_placement_list", ReadOnly = true),
     Description(
         "List every machine that stands on a site, ordered by machineId: its siteId, hall (or null), " +
         "displayName (or null), placedAt, when it was put on that site (UTC), and position (or null), where in " +
         "its hall it stands: the middle of the machine, x and y in metre from the upper left corner of the plan " +
         "of the hall. A machine stands on one site at most. A machine that sends values but is not listed here " +
         "stands on no site.")]
    public async Task<IReadOnlyList<PlacementDtoV1>> ListPlacements(CancellationToken cancellationToken = default)
    {
        var placements = await store.ListPlacementsAsync(cancellationToken).ConfigureAwait(false);
        return SitesMapper.ToDtos(placements);
    }
}
