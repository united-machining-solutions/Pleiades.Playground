using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.Common.AspNetCore;

public static class CorsExtensions
{
    /// <summary>
    /// Adds the default Pleiades CORS policy.
    /// Policy: AllowAnyOrigin, AllowAnyHeader, AllowAnyMethod.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection.</returns>
    public static IServiceCollection AddPleiadesDefaultCors(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        return services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            });
        });
    }

    /// <summary>
    /// Uses the default Pleiades CORS policy.
    /// </summary>
    /// <param name="app">The application builder.</param>
    /// <returns>The application builder.</returns>
    public static IApplicationBuilder UsePleiadesDefaultCors(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        return app.UseCors();
    }
}
