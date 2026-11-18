using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// The real <c>Program</c> without MongoDB: the store is kept in memory, the index initializer is removed, and
/// the clock stands still until a test moves it.
/// </summary>
internal static class SitesApiFactory
{
    internal const string Issuer = "https://keycloak.test/realms/pleiades";
    internal const string Audience = "sites-api";
    internal const string InternalApiKey = "test-internal-key";

    // A key of the test only: tokens signed with it are accepted by the host with auth on.
    internal static readonly SymmetricSecurityKey SigningKey = new("a-signing-key-of-the-tests-only-32-bytes!!"u8.ToArray());

    /// <summary>The host with auth off, as in the demo stack.</summary>
    internal static WebApplicationFactory<Program> Create(
        InMemorySitesStore store,
        FixedTimeProvider clock,
        string environment = "Test") =>
        CreateCore(store, clock, environment, authEnabled: false);

    /// <summary>
    /// The host with auth on: a token signed with <see cref="SigningKey"/> or the internal API key passes, the
    /// policies decide by the roles <c>sites:read</c> and <c>sites:write</c>. No identity provider is reached.
    /// </summary>
    internal static WebApplicationFactory<Program> CreateWithAuth(InMemorySitesStore store, FixedTimeProvider clock) =>
        CreateCore(store, clock, "Test", authEnabled: true);

    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "WithWebHostBuilder manages the lifetime of the parent factory")]
    private static WebApplicationFactory<Program> CreateCore(
        InMemorySitesStore store,
        FixedTimeProvider clock,
        string environment,
        bool authEnabled) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);

            builder.UseSetting("Config:Loki:Sinks:0:Name", "Local");
            builder.UseSetting("Config:Loki:Sinks:0:Enabled", "false");
            builder.UseSetting("Config:Loki:Sinks:0:Uri", "http://localhost:3100");

            builder.UseSetting("Config:Auth:Enabled", authEnabled ? "true" : "false");
            if (authEnabled)
            {
                builder.UseSetting("Config:Auth:MetadataAddress", "http://keycloak.test/realms/pleiades/.well-known/openid-configuration");
                builder.UseSetting("Config:Auth:ValidIssuer", Issuer);
                builder.UseSetting("Config:Auth:Audience", Audience);
                builder.UseSetting("Config:Auth:InternalApiKeys:0", InternalApiKey);
            }

            builder.ConfigureTestServices(services =>
            {
                services.Remove(services.Single(d => d.ImplementationType == typeof(MongoDbInitializer)));
                services.Remove(services.Single(d => d.ServiceType == typeof(ISitesStore)));
                services.AddSingleton<ISitesStore>(store);
                services.Remove(services.Single(d => d.ServiceType == typeof(TimeProvider)));
                services.AddSingleton<TimeProvider>(clock);

                if (authEnabled)
                {
                    // Validate with the key of the test instead of the keys of an identity provider.
                    services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                    {
                        options.ConfigurationManager = null;
                        options.TokenValidationParameters.IssuerSigningKey = SigningKey;
                    });
                }
            });
        });
}
