namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// The convention that bridges an API to its Keycloak permission roles and ASP.NET
/// authorization policies. An API <c>{name}</c> maps to the resource-permission roles
/// <c>{name}:read</c> and <c>{name}:write</c>, modelled as client roles of that API's
/// own Keycloak client (e.g. <c>events-api</c>); they arrive in the token's flat
/// <c>roles</c> claim. These are deliberately distinct from a frontend's UI-feature
/// roles (<c>feature-{name}</c> on the SPA client) and are never assigned to users
/// directly — UI roles include them via composites.
/// </summary>
public static class FeaturePolicy
{
    /// <summary>Authorization-policy name guarding read access to an API.</summary>
    public static string Read(string feature) => $"{feature}:read";

    /// <summary>Authorization-policy name guarding write access to an API.</summary>
    public static string Write(string feature) => $"{feature}:write";

    /// <summary>Keycloak permission role granting read access to an API.</summary>
    public static string ReadRole(string feature) => $"{feature}:read";

    /// <summary>Keycloak permission role granting write access to an API.</summary>
    public static string WriteRole(string feature) => $"{feature}:write";
}
