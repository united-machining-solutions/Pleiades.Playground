using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>
/// Registration entry points for Pleiades backend JWT authorization.
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Configures JWT bearer authentication from the given <c>Config:Auth</c> section.
    /// <c>Enabled</c> is the single switch — on is on, off is off, in every environment:
    /// <c>Enabled=false</c> runs the API unauthenticated (local dev, or an edge install with
    /// no identity provider). It defaults to <see langword="true"/>, so auth is on unless
    /// explicitly turned off. An enabled-but-misconfigured setup (issuer/audience/metadata
    /// missing) still throws at startup — a half-configured service must not silently
    /// accept everything.
    /// </summary>
    public static IServiceCollection AddPleiadesJwtAuth(
        this IServiceCollection services,
        IConfigurationSection authSection,
        IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(authSection);
        ArgumentNullException.ThrowIfNull(environment);

        var options = authSection.Get<AuthOptions>() ?? new AuthOptions();
        services.AddSingleton(options);

        if (!options.Enabled)
        {
            // Auth opt-out (local dev, or an edge install with no identity provider): no real
            // authentication scheme, but still register the authentication core services so
            // UsePleiadesAuth's UseAuthentication() has an IAuthenticationSchemeProvider
            // to resolve — otherwise the host fails to start ("Unable to resolve
            // IAuthenticationSchemeProvider"). With no scheme the middleware is a no-op;
            // feature policies are registered permissively by AddPleiadesFeatureAuthorization.
            services.AddAuthentication();
            return services;
        }

        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(options.MetadataAddress)) { missing.Add(nameof(AuthOptions.MetadataAddress)); }
        if (string.IsNullOrWhiteSpace(options.ValidIssuer)) { missing.Add(nameof(AuthOptions.ValidIssuer)); }
        if (string.IsNullOrWhiteSpace(options.Audience)) { missing.Add(nameof(AuthOptions.Audience)); }
        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                $"Authentication is enabled but misconfigured. Missing Config:Auth values: {string.Join(", ", missing)}.");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                jwt.MetadataAddress = options.MetadataAddress!; // validated non-null above
                // Keycloak is reached over plain HTTP inside the cluster.
                jwt.RequireHttpsMetadata = false;
                // Keep Keycloak's raw claim names. The legacy SOAP claim-type mapping
                // would rename the flat roles claim and break role checks.
                jwt.MapInboundClaims = false;
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = options.ValidIssuer,
                    ValidateAudience = true,
                    ValidAudience = options.Audience,
                    ValidateLifetime = true,
                    ClockSkew = options.ClockSkew,
                    // Keycloak emits roles in a flat, custom `roles` claim (realm's
                    // User-Client-Role mapper); bind RBAC to exactly that claim.
                    RoleClaimType = "roles",
                    NameClaimType = "preferred_username",
                };

                if (options.JwksUriOverride is not null)
                {
                    jwt.ConfigurationManager = new JwksOverrideConfigurationManager(
                        options.MetadataAddress!, options.JwksUriOverride);
                }

                if (!string.IsNullOrWhiteSpace(options.AccessTokenHeader))
                {
                    // The gateway injects the access token into a custom header
                    // (Traefik can't rename it to Authorization: Bearer). Read it
                    // from there as the single token source.
                    var headerName = options.AccessTokenHeader;
                    jwt.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            context.Token = GatewayToken.Extract(context.Request.Headers, headerName);
                            return Task.CompletedTask;
                        },
                    };
                }
            })
            // Trusted East-West callers (no user token) authenticate via a shared key
            // in the X-Internal-Api-Key header, validated locally (no Keycloak call).
            .AddScheme<AuthenticationSchemeOptions, InternalApiKeyAuthenticationHandler>(
                InternalApiKeyDefaults.Scheme, _ => { });

        return services;
    }

    /// <summary>
    /// Registers read/write authorization policies for the given APIs. Read accepts the
    /// API's read <em>or</em> write role (a writer can read); write requires the write
    /// role. When auth is disabled (non-prod) the policies are permissive, so endpoints
    /// behave exactly as they did before auth existed.
    /// </summary>
    public static IServiceCollection AddPleiadesFeatureAuthorization(
        this IServiceCollection services,
        IConfigurationSection authSection,
        params string[] features)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(authSection);
        ArgumentNullException.ThrowIfNull(features);

        var enabled = authSection.GetValue("Enabled", true);
        var authz = services.AddAuthorizationBuilder();

        foreach (var feature in features)
        {
            if (enabled)
            {
                // A request satisfies a feature policy via the Keycloak role (user JWT)
                // OR a valid internal API key (East-West S2S). Both schemes are evaluated so
                // either identity can carry the request. RequireAuthenticatedUser is kept so a
                // spoofed UNauthenticated identity carrying role claims (e.g. a forged
                // X-Auth-Request-Groups header) is denied — only a validated JWT or the internal
                // key produces an authenticated principal.
                authz.AddPolicy(FeaturePolicy.Read(feature), policy =>
                {
                    policy.AddAuthenticationSchemes(
                        JwtBearerDefaults.AuthenticationScheme, InternalApiKeyDefaults.Scheme);
                    policy.RequireAuthenticatedUser();
                    policy.RequireAssertion(ctx =>
                        ctx.User.IsInRole(FeaturePolicy.ReadRole(feature))
                        || ctx.User.IsInRole(FeaturePolicy.WriteRole(feature))
                        || ctx.User.HasClaim(InternalApiKeyDefaults.ClaimType, "true"));
                });
                authz.AddPolicy(FeaturePolicy.Write(feature), policy =>
                {
                    policy.AddAuthenticationSchemes(
                        JwtBearerDefaults.AuthenticationScheme, InternalApiKeyDefaults.Scheme);
                    policy.RequireAuthenticatedUser();
                    policy.RequireAssertion(ctx =>
                        ctx.User.IsInRole(FeaturePolicy.WriteRole(feature))
                        || ctx.User.HasClaim(InternalApiKeyDefaults.ClaimType, "true"));
                });
            }
            else
            {
                authz.AddPolicy(FeaturePolicy.Read(feature), policy => policy.RequireAssertion(_ => true));
                authz.AddPolicy(FeaturePolicy.Write(feature), policy => policy.RequireAssertion(_ => true));
            }
        }

        return services;
    }

    /// <summary>
    /// Adds a health check reporting whether authentication is enabled, so the diagnostic endpoint
    /// exposes an ungated instance instead of it being silent.
    /// </summary>
    /// <remarks>
    /// <b>Always Healthy; the answer is in the payload.</b> The entry named <c>authentication</c>
    /// carries <c>Data["authenticationEnabled"]</c> (a boolean) and a description that names the
    /// state. It reported <c>Degraded</c> until 2026-09-21 — which ASP.NET logs at Warning on
    /// EVERY evaluation, so a constant was re-asserted 8,640 times a day per service at a 10 s probe
    /// interval. Read the state from <c>Data</c>, never from the status.
    /// </remarks>
    public static IHealthChecksBuilder AddPleiadesAuthStatus(
        this IHealthChecksBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.AddCheck<AuthStatusHealthCheck>("authentication");
    }
}
