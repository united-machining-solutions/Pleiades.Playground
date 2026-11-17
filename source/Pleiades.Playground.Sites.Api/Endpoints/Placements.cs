using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// The endpoints of the placements: which machine stands on which site. A machine stands on one site at most.
/// </summary>
internal static class Placements
{
    internal static RouteGroupBuilder MapPlacements(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetPlacements)
            .WithName("GetPlacements")
            .WithSummary("Lists every machine on a site")
            .RequireFeatureRead(SitesFeature.Name);

        group.MapPut("/{serialNumber}", PutPlacement)
            .WithName("PutPlacement")
            .WithSummary("Puts a machine on a site, or moves it")
            .RequireFeatureWrite(SitesFeature.Name);

        group.MapDelete("/{serialNumber}", DeletePlacement)
            .WithName("DeletePlacement")
            .WithSummary("Takes a machine off its site")
            .RequireFeatureWrite(SitesFeature.Name);

        return group;
    }

    /// <summary>
    /// Lists every machine on a site, ordered by serial number.
    /// </summary>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Every placement.</returns>
    internal static async Task<Ok<IReadOnlyList<PlacementDtoV1>>> GetPlacements(ISitesStore store, CancellationToken cancellationToken)
    {
        var placements = await store.ListPlacementsAsync(cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(SitesMapper.ToDtos(placements));
    }

    /// <summary>
    /// Puts a machine on a site, or moves it to another site or hall. Its values and notifications are not
    /// touched. The time it was placed changes only when the site does.
    /// </summary>
    /// <param name="serialNumber">The serial number: no '/', '+', '#' or '%', no blank at either end. Example: M-05</param>
    /// <param name="request">Site, hall and display name.</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="timeProvider">The clock of the time a machine is placed.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>201 for a machine not placed before, 200 for one moved or changed, 400 for an invalid placement or an unknown site or hall.</returns>
    internal static async Task<Results<Created<PlacementDtoV1>, Ok<PlacementDtoV1>, BadRequest<string>>> PutPlacement(
        string serialNumber,
        PlacementRequestV1 request,
        ISitesStore store,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if ((SiteRules.CheckTopicLevel(serialNumber, "serial number") ?? SiteRules.CheckPlacement(request)) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.InTransactionAsync(
            async Task<Results<Created<PlacementDtoV1>, Ok<PlacementDtoV1>, BadRequest<string>>> (tx, token) =>
            {
                var site = await tx.FindSiteAsync(request.SiteId!, token).ConfigureAwait(false);
                if (SiteRules.CheckPlacementOnSite(request, site) is { } siteError)
                {
                    return TypedResults.BadRequest(siteError);
                }

                // A concurrent transaction that removes the site or drops the hall now conflicts with this one.
                await tx.ClaimSiteAsync(request.SiteId!, token).ConfigureAwait(false);

                var existing = await tx.FindPlacementAsync(serialNumber, token).ConfigureAwait(false);
                var placement = new PlacementDao
                {
                    SerialNumber = serialNumber,
                    SiteId = request.SiteId!,
                    Hall = request.Hall,
                    DisplayName = request.DisplayName,
                    PlacedAt = existing is not null && existing.SiteId == request.SiteId
                        ? existing.PlacedAt
                        : Now(timeProvider),
                };

                await tx.SavePlacementAsync(placement, token).ConfigureAwait(false);

                var dto = SitesMapper.ToDto(placement);
                return existing is null
                    ? TypedResults.Created(new Uri($"/placements/{Uri.EscapeDataString(serialNumber)}", UriKind.Relative), dto)
                    : TypedResults.Ok(dto);
            },
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Takes a machine off its site. Its values and notifications stay; a machine that keeps sending shows up
    /// again as not placed.
    /// </summary>
    /// <param name="serialNumber">The serial number. Example: M-05</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>204 when removed, 404 when the machine stood on no site.</returns>
    internal static async Task<Results<NoContent, NotFound, BadRequest<string>>> DeletePlacement(
        string serialNumber,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if (SiteRules.CheckTopicLevel(serialNumber, "serial number") is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.DeletePlacementAsync(serialNumber, cancellationToken).ConfigureAwait(false)
            ? TypedResults.NoContent()
            : TypedResults.NotFound();
    }

    // MongoDB keeps milliseconds, so the answer to the PUT carries the instant a later GET returns.
    private static DateTime Now(TimeProvider timeProvider)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return new DateTime(now.Ticks - (now.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Utc);
    }
}
