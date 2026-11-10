namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>
/// The Events API's own resource permission, mapped via the library convention to the
/// Keycloak permission roles <c>events:read</c> (read) / <c>events:write</c> (write) —
/// client roles of the <c>events-api</c> client. Deliberately decoupled from any single
/// frontend's UI feature roles: a consuming app's own feature roles carry <c>events:read</c>
/// via composite roles, and other apps are granted it directly — so the API never enforces
/// one app's UI taxonomy. Trusted service-to-service callers use the
/// internal API key instead (see <c>AuthOptions.InternalApiKeys</c>). Kept in one place so a
/// typo at a single call site cannot silently break the policies.
/// </summary>
internal static class EventsFeature
{
    internal const string Name = "events";
}
