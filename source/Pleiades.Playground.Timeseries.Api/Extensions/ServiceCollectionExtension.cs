using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Api.Services.MongoDb;

namespace Pleiades.Playground.Timeseries.Api.Extensions;

internal static class ServiceCollectionExtension
{
    /// <summary>
    /// Registers MongoDB-backed timeseries services (Time-Series-Collections) and the
    /// collection/index initializer.
    /// </summary>
    internal static IServiceCollection ConfigureMongoTimeseries(this IServiceCollection services)
    {
        services.AddOptions<MongoTimeseriesSettings>()
            .BindConfiguration("Config:MongoTimeseries")
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IMongoClient>(sp =>
        {
            var settings = sp.GetRequiredService<IOptions<MongoTimeseriesSettings>>().Value;
            return new MongoClient(settings.ConnectionString);
        });

        services.AddSingleton<IMongoDatabase>(sp =>
        {
            var settings = sp.GetRequiredService<IOptions<MongoTimeseriesSettings>>().Value;
            return sp.GetRequiredService<IMongoClient>().GetDatabase(settings.DatabaseName);
        });

        services.AddSingleton<ITimeseriesDbService>(sp => new MongoTimeseriesService(
            sp.GetRequiredService<IMongoDatabase>(),
            sp.GetRequiredService<IOptions<MongoTimeseriesSettings>>(),
            sp.GetRequiredService<ILogger<MongoTimeseriesService>>()));

        services.AddHostedService<MongoTimeseriesInitializer>();

        return services;
    }
}
