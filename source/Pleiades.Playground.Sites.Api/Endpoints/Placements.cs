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

        group.MapPut("/{machineId}", PutPlacement)
            .WithName("PutPlacement")
            .WithSummary("Puts a machine on a site, or moves it")
            .RequireFeatureWrite(SitesFeature.Name);

        group.MapDelete("/{machineId}", DeletePlacement)
            .WithName("DeletePlacement")
            .WithSummary("Takes a machine off its site")
            .RequireFeatureWrite(SitesFeature.Name);

        group.MapPut("/{machineId}/position", PutPosition)
            .WithName("PutPlacementPosition")
            .WithSummary("Says where in its hall a machine stands")
            .RequireFeatureWrite(SitesFeature.Name);

        group.MapDelete("/{machineId}/position", DeletePosition)
            .WithName("DeletePlacementPosition")
            .WithSummary("Takes the position of a machine in its hall away")
            .RequireFeatureWrite(SitesFeature.Name);

        return group;
    }

    /// <summary>
    /// Lists every machine on a site, ordered by machine id.
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
    /// touched. The time it was placed changes only when the site does. Its position in the hall stays while
    /// site and hall stay, and goes when either changes: a position is one on the plan of that hall.
    /// </summary>
    /// <param name="machineId">The machine id: no '/', '+', '#' or '%', no blank at either end. Example: merope-microtec_MM-120_M-02</param>
    /// <param name="request">Site, hall and display name.</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="timeProvider">The clock of the time a machine is placed.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>201 for a machine not placed before, 200 for one moved or changed, 400 for an invalid placement or an unknown site or hall.</returns>
    internal static async Task<Results<Created<PlacementDtoV1>, Ok<PlacementDtoV1>, BadRequest<string>>> PutPlacement(
        string machineId,
        PlacementRequestV1 request,
        ISitesStore store,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if ((SiteRules.CheckTopicLevel(machineId, "machine id") ?? SiteRules.CheckPlacement(request)) is { } error)
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

                var existing = await tx.FindPlacementAsync(machineId, token).ConfigureAwait(false);
                var placement = new PlacementDao
                {
                    MachineId = machineId,
                    SiteId = request.SiteId!,
                    Hall = request.Hall,
                    DisplayName = request.DisplayName,
                    PlacedAt = existing is not null && existing.SiteId == request.SiteId
                        ? existing.PlacedAt
                        : Now(timeProvider),
                    Position = existing is not null && existing.SiteId == request.SiteId && existing.Hall == request.Hall
                        ? existing.Position
                        : null,
                };

                await tx.SavePlacementAsync(placement, token).ConfigureAwait(false);

                var dto = SitesMapper.ToDto(placement);
                return existing is null
                    ? TypedResults.Created(new Uri($"/placements/{Uri.EscapeDataString(machineId)}", UriKind.Relative), dto)
                    : TypedResults.Ok(dto);
            },
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Takes a machine off its site. Its values and notifications stay; a machine that keeps sending shows up
    /// again as not placed.
    /// </summary>
    /// <param name="machineId">The machine id. Example: merope-microtec_MM-120_M-02</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>204 when removed, 404 when the machine stood on no site.</returns>
    internal static async Task<Results<NoContent, NotFound, BadRequest<string>>> DeletePlacement(
        string machineId,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if (SiteRules.CheckTopicLevel(machineId, "machine id") is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.DeletePlacementAsync(machineId, cancellationToken).ConfigureAwait(false)
            ? TypedResults.NoContent()
            : TypedResults.NotFound();
    }

    /// <summary>
    /// Says where in its hall a machine stands, on the plan of the hall seen from above: the middle of the
    /// machine, in metre from the upper left corner of the plan. Nothing else of the placement changes.
    /// </summary>
    /// <param name="machineId">The machine id. Example: merope-microtec_MM-120_M-02</param>
    /// <param name="request">The position, x and y in metre.</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>200 with the placement, 400 for an invalid position or a machine in no hall, 404 when the machine stands on no site.</returns>
    internal static async Task<Results<Ok<PlacementDtoV1>, NotFound, BadRequest<string>>> PutPosition(
        string machineId,
        PositionRequestV1 request,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if ((SiteRules.CheckTopicLevel(machineId, "machine id") ?? SiteRules.CheckPosition(request)) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.InTransactionAsync(
            async Task<Results<Ok<PlacementDtoV1>, NotFound, BadRequest<string>>> (tx, token) =>
            {
                var existing = await tx.FindPlacementAsync(machineId, token).ConfigureAwait(false);
                if (existing is null)
                {
                    return TypedResults.NotFound();
                }

                if (existing.Hall is null)
                {
                    return TypedResults.BadRequest($"The machine '{machineId}' stands in no hall: put it in a hall with PUT /placements/{machineId} first.");
                }

                var placement = WithPosition(existing, new PositionDao { X = request.X!.Value, Y = request.Y!.Value });
                await tx.SavePlacementAsync(placement, token).ConfigureAwait(false);
                return TypedResults.Ok(SitesMapper.ToDto(placement));
            },
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Takes the position of a machine in its hall away. The machine stays on its site and in its hall.
    /// </summary>
    /// <param name="machineId">The machine id. Example: merope-microtec_MM-120_M-02</param>
    /// <param name="store">The store of sites and placements.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>204 when the machine has no position now, 404 when the machine stands on no site.</returns>
    internal static async Task<Results<NoContent, NotFound, BadRequest<string>>> DeletePosition(
        string machineId,
        ISitesStore store,
        CancellationToken cancellationToken)
    {
        if (SiteRules.CheckTopicLevel(machineId, "machine id") is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        return await store.InTransactionAsync(
            async Task<Results<NoContent, NotFound, BadRequest<string>>> (tx, token) =>
            {
                var existing = await tx.FindPlacementAsync(machineId, token).ConfigureAwait(false);
                if (existing is null)
                {
                    return TypedResults.NotFound();
                }

                if (existing.Position is not null)
                {
                    await tx.SavePlacementAsync(WithPosition(existing, null), token).ConfigureAwait(false);
                }

                return TypedResults.NoContent();
            },
            cancellationToken).ConfigureAwait(false);
    }

    private static PlacementDao WithPosition(PlacementDao placement, PositionDao? position) => new()
    {
        MachineId = placement.MachineId,
        SiteId = placement.SiteId,
        Hall = placement.Hall,
        DisplayName = placement.DisplayName,
        PlacedAt = placement.PlacedAt,
        Position = position,
    };

    // MongoDB keeps milliseconds, so the answer to the PUT carries the instant a later GET returns.
    private static DateTime Now(TimeProvider timeProvider)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return new DateTime(now.Ticks - (now.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Utc);
    }
}
