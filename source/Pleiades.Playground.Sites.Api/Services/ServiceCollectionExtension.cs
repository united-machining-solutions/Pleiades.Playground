using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Pleiades.Playground.Sites.Api.Services;

internal static class ServiceCollectionExtension
{
    /// <summary>
    /// Registers the MongoDB settings, the client, the store and the index initializer.
    /// </summary>
    internal static IServiceCollection ConfigureMongoDb(this IServiceCollection services)
    {
        services.AddOptions<MongoDbSettings>()
            .BindConfiguration("Config:MongoDb")
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IMongoClient>(sp =>
        {
            var settings = sp.GetRequiredService<IOptions<MongoDbSettings>>().Value;
            return new MongoClient(settings.ConnectionString);
        });

        services.AddSingleton<ISitesStore, MongoSitesStore>();
        services.AddHostedService<MongoDbInitializer>();

        return services;
    }
}
