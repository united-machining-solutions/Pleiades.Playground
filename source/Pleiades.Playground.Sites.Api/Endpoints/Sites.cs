using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// The endpoints of the sites: places with a company, a plant and its halls.
/// </summary>
internal static class Sites
{
    internal static RouteGroupBuilder MapSites(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetSites)
            .WithName("GetSites")
            .WithSummary("Lists every site with its halls")
            .RequireFeatureRead(SitesFeature.Name);

        group.MapPut("/{siteId}", PutSite)
            .WithName("PutSite")
            .WithSummary("Creates or changes a site")
            .RequireFeatureWrite(SitesFeature.Name);

        group.MapDelete("/{siteId}", DeleteSite)
            .WithName("DeleteSite")
            .WithSummary("Removes a site that has no machines")
            .RequireFeatureWrite(SitesFeature.Name);

        return group;
    }

    /// <summary>
    /// Lists every site with its halls, ordered by site id.
    /// </summary>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Every site.</returns>
    internal static async Task<Ok<IReadOnlyList<SiteDtoV1>>> GetSites(ISitesStore store, CancellationToken cancellationToken)
    {
        var sites = await store.ListSitesAsync(cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(SitesMapper.ToDtos(sites));
    }

    /// <summary>
    /// Creates a site, or changes the one with this id. A hall that still has machines cannot be left out.
    /// </summary>
    /// <param name="siteId">The site id: no '/', '+', '#' or '%', no blank at either end. Example: north-plant</param>
    /// <param name="request">Company, name and halls of the site.</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>201 for a new site, 200 for a changed one, 400 for an invalid site, 409 when a hall left out still has machines.</returns>
    internal static async Task<Results<Created<SiteDtoV1>, Ok<SiteDtoV1>, BadRequest<string>, Conflict<string>>> PutSite(
        string siteId,
        SiteRequestV1 request,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if ((SiteRules.CheckTopicLevel(siteId, "site id") ?? SiteRules.CheckSite(request)) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var site = new SiteDao
        {
            SiteId = siteId,
            Company = request.Company!,
            Name = request.Name!,
            Halls = [.. request.Halls ?? []],
        };

        return await store.InTransactionAsync(
            async Task<Results<Created<SiteDtoV1>, Ok<SiteDtoV1>, BadRequest<string>, Conflict<string>>> (tx, token) =>
            {
                var existing = await tx.FindSiteAsync(siteId, token).ConfigureAwait(false);
                if (existing is not null)
                {
                    var leftOut = existing.Halls.Except(site.Halls, StringComparer.Ordinal).ToHashSet(StringComparer.Ordinal);
                    if (leftOut.Count > 0)
                    {
                        var placements = await tx.ListPlacementsOfSiteAsync(siteId, token).ConfigureAwait(false);
                        var inLeftOut = placements.Where(p => p.Hall is not null && leftOut.Contains(p.Hall)).ToList();
                        if (inLeftOut.Count > 0)
                        {
                            return TypedResults.Conflict(
                                $"The hall '{inLeftOut[0].Hall}' of the site '{siteId}' still has machines: " +
                                $"{string.Join(", ", inLeftOut.Select(p => p.SerialNumber))}. Move or remove them first.");
                        }
                    }
                }

                // Saving writes the site, so a concurrent transaction that put a machine on it conflicts.
                await tx.SaveSiteAsync(site, token).ConfigureAwait(false);

                var dto = SitesMapper.ToDto(site);
                return existing is null
                    ? TypedResults.Created(new Uri($"/sites/{Uri.EscapeDataString(siteId)}", UriKind.Relative), dto)
                    : TypedResults.Ok(dto);
            },
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Removes a site. A site that still has machines is not removed.
    /// </summary>
    /// <param name="siteId">The site id. Example: north-plant</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>204 when removed, 404 when there is no such site, 409 when it still has machines.</returns>
    internal static async Task<Results<NoContent, NotFound, BadRequest<string>, Conflict<string>>> DeleteSite(
        string siteId,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if (SiteRules.CheckTopicLevel(siteId, "site id") is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.InTransactionAsync(
            async Task<Results<NoContent, NotFound, BadRequest<string>, Conflict<string>>> (tx, token) =>
            {
                var placements = await tx.ListPlacementsOfSiteAsync(siteId, token).ConfigureAwait(false);
                if (placements.Count > 0)
                {
                    return TypedResults.Conflict(
                        $"The site '{siteId}' still has machines: {string.Join(", ", placements.Select(p => p.SerialNumber))}. " +
                        "Move or remove them first.");
                }

                // Deleting writes the site, so a concurrent transaction that put a machine on it conflicts.
                return await tx.DeleteSiteAsync(siteId, token).ConfigureAwait(false)
                    ? TypedResults.NoContent()
                    : TypedResults.NotFound();
            },
            cancellationToken).ConfigureAwait(false);
    }
}
