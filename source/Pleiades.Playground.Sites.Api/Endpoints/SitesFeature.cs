namespace Pleiades.Playground.Sites.Api.Endpoints;

/// <summary>
/// The resource permission of the Sites API, mapped by the library convention to the Keycloak roles
/// <c>sites:read</c> and <c>sites:write</c>, as the other APIs do. Kept in one place so a typo at one call site
/// cannot break a policy.
/// </summary>
internal static class SitesFeature
{
    internal const string Name = "sites";
}
