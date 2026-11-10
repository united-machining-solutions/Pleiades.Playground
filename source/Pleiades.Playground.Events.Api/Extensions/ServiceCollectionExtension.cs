using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Events.Api.Services;

namespace Pleiades.Playground.Events.Api.Extensions;

internal static class ServiceCollectionExtension
{
    internal static IServiceCollection ConfigureMongoDb(this IServiceCollection services)
    {
        // ═══════════════════════════════════════════════════════════════
        // 1. CONFIGURATION - Bind MongoDbSettings
        // ═══════════════════════════════════════════════════════════════
        services.AddOptions<MongoDbSettings>()
            .BindConfiguration("Config:MongoDb")
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // ═══════════════════════════════════════════════════════════════
        // 2. DATABASE - MongoClient + DbContext as singletons
        // ═══════════════════════════════════════════════════════════════
        services.AddSingleton<IMongoClient>(sp =>
        {
            var settings = sp.GetRequiredService<IOptions<MongoDbSettings>>().Value;
            return new MongoClient(settings.ConnectionString);
        });

        services.AddSingleton<IEventsDbContext, EventsDbContext>();

        // ═══════════════════════════════════════════════════════════════
        // 3. REPOSITORIES - transient for stateless CRUD operations
        // ═══════════════════════════════════════════════════════════════
        services.AddTransient<INotificationEventRepository, NotificationEventRepository>();

        // ═══════════════════════════════════════════════════════════════
        // 4. INDEX SERVICE
        // ═══════════════════════════════════════════════════════════════
        services.AddHostedService<MongoDbInitializer>();

        return services;
    }
}
