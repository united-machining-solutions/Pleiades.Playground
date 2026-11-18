namespace Pleiades.Playground.Sites.Api.DataTransferObjects;

/// <summary>
/// A site: a place with a company, a plant and its halls.
/// </summary>
/// <param name="SiteId">The site id, the <c>{SiteId}</c> of <c>sites/{SiteId}</c> in the MQTT binding. Example: north-plant</param>
/// <param name="Company">The company the site belongs to. Example: Demo Manufacturing</param>
/// <param name="Name">The name of the plant. Example: North plant</param>
/// <param name="Halls">The halls of the site. Example: ["Hall 1", "Hall 2"]</param>
internal sealed record SiteDtoV1(string SiteId, string Company, string Name, IReadOnlyList<string> Halls);

/// <summary>
/// The body of <c>PUT /sites/{siteId}</c>: what a site is, without its id, which the path carries.
/// </summary>
/// <param name="Company">The company the site belongs to; required. Example: Demo Manufacturing</param>
/// <param name="Name">The name of the plant; required. Example: North plant</param>
/// <param name="Halls">The halls of the site, each named once; none when left out. Example: ["Hall 1", "Hall 2"]</param>
internal sealed record SiteRequestV1(string? Company, string? Name, IReadOnlyList<string>? Halls);

/// <summary>
/// A machine on a site.
/// </summary>
/// <param name="MachineId">The machine id, the <c>{MachineId}</c> of <c>machines/{MachineId}</c> in the MQTT binding, as every API and tool of the stack names a machine. Example: merope-microtec_MM-120_M-02</param>
/// <param name="SiteId">The site the machine stands on. Example: north-plant</param>
/// <param name="Hall">The hall of the site, or null when not given. Example: Hall 2</param>
/// <param name="DisplayName">The name people know the machine by, or null when not given. Example: M-02</param>
/// <param name="PlacedAt">When the machine was put on this site (UTC). Example: 2026-11-18T08:12:00Z</param>
internal sealed record PlacementDtoV1(string MachineId, string SiteId, string? Hall, string? DisplayName, DateTime PlacedAt);

/// <summary>
/// The body of <c>PUT /placements/{machineId}</c>: where a machine stands, without its machine id, which
/// the path carries.
/// </summary>
/// <param name="SiteId">The site; required, and the site must exist. Example: north-plant</param>
/// <param name="Hall">One of the halls of the site, or left out. Example: Hall 2</param>
/// <param name="DisplayName">The name people know the machine by, or left out. Example: M-02</param>
internal sealed record PlacementRequestV1(string? SiteId, string? Hall, string? DisplayName);
