namespace Pleiades.Playground.Timeseries.Api.Endpoints;

/// <summary>
/// The Timeseries API's own resource permission, mapped via the library convention to the
/// Keycloak permission roles <c>timeseries:read</c> (read) / <c>timeseries:write</c> (write) —
/// client roles of the <c>timeseries-api</c> client. Deliberately decoupled from any single
/// frontend's UI feature roles: consuming apps carry <c>timeseries:read</c> via composite roles,
/// and future apps are granted it directly — so the API never enforces one app's UI taxonomy.
/// Trusted service-to-service callers (e.g. the persistence worker) use the internal API key
/// instead (see <c>AuthOptions.InternalApiKeys</c>). Kept in one place so a typo at a single call
/// site cannot silently break the policies.
/// </summary>
internal static class TimeseriesFeature
{
    internal const string Name = "timeseries";
}
