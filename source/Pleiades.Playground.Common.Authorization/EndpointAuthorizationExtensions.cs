using Microsoft.AspNetCore.Builder;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Fluent guards for minimal-API endpoints and route groups, mapping to the
/// feature read/write policies (see <see cref="FeaturePolicy"/>).
/// </summary>
public static class EndpointAuthorizationExtensions
{
    /// <summary>Requires the read policy for <paramref name="feature"/>.</summary>
    public static TBuilder RequireFeatureRead<TBuilder>(this TBuilder builder, string feature)
        where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(FeaturePolicy.Read(feature));

    /// <summary>Requires the write policy for <paramref name="feature"/>.</summary>
    public static TBuilder RequireFeatureWrite<TBuilder>(this TBuilder builder, string feature)
        where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(FeaturePolicy.Write(feature));
}
