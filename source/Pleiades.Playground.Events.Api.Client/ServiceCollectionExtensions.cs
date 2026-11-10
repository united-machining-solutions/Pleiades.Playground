using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.RestApi;

namespace Pleiades.Playground.Events.Api.Client;

public static class ServiceCollectionExtensions
{
    public static IHttpClientBuilder AddEventsApiService<TInterface, TImplementation>(
        this IServiceCollection services,
        IConfigurationSection configurationSection)
        where TInterface : class
        where TImplementation : class, TInterface
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configurationSection);

        services.AddOptions<RestApiConfig>(typeof(TImplementation).Name)
            .Bind(configurationSection)
            .ValidateDataAnnotations();

        return services.AddHttpClient<TInterface, TImplementation>()
            .ConfigureHttpClient((sp, client) =>
            {
                var config = sp.GetRequiredService<IOptionsMonitor<RestApiConfig>>()
                    .Get(typeof(TImplementation).Name);
                client.BaseAddress = config.Uri;
                client.Timeout = config.Timeout;
                // Trusted service-to-service auth: send the internal API key when configured.
                client.ApplyInternalApiKey(config);
            });
    }

    public static IHealthChecksBuilder AddEventsApi(
        this IHealthChecksBuilder builder,
        IConfigurationSection configurationSection)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(configurationSection);

        builder.Services.AddHttpClient<EventsApiHealthCheck>()
            .ConfigureHttpClient((_, client) =>
            {
                var config = configurationSection.Get<RestApiConfig>()
                    ?? throw new InvalidOperationException("RestApiConfig binding failed.");
                client.BaseAddress = config.Uri;
                client.Timeout = TimeSpan.FromSeconds(5);
                client.ApplyInternalApiKey(config);
            });

        builder.Add(new HealthCheckRegistration(
            "events-api",
            sp => sp.GetRequiredService<EventsApiHealthCheck>(),
            failureStatus: HealthStatus.Unhealthy,
            tags: ["ready"]));

        return builder;
    }
}
