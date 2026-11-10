using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Common.Json;

namespace Pleiades.Playground.Common.AspNetCore;

/// <summary>
/// Extension methods for configuring JSON serialization in ASP.NET Core Minimal APIs.
/// </summary>
public static class JsonExtensions
{
    /// <summary>
    /// Configures <c>HttpJsonOptions</c> (used by Minimal API endpoints for request body binding
    /// and response serialization) with Pleiades defaults including <c>JsonStringEnumConverter</c>.
    /// This is the Minimal API counterpart to <see cref="JsonSerializerOptionsExtension.AddPleiadesDefaultJsonOptions"/>.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddPleiadesHttpJsonOptions(this IServiceCollection services)
        => services.AddPleiadesHttpJsonOptions(configure: null);

    /// <summary>
    /// Configures <c>HttpJsonOptions</c> (used by Minimal API endpoints) with Pleiades defaults
    /// (camelCase, case-insensitive properties, <c>AllowNamedFloatingPointLiterals</c>, <c>JsonStringEnumConverter</c>),
    /// then invokes <paramref name="configure"/> so callers can register API-specific converters
    /// (e.g. a domain <c>JsonChannelConverter</c>) on top of the shared base. The delegate runs after the
    /// defaults are applied, so custom converters take precedence for the types they handle.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configure">Optional callback to add per-API converters/settings after the UG defaults. May be <c>null</c>.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddPleiadesHttpJsonOptions(
        this IServiceCollection services,
        Action<JsonSerializerOptions>? configure)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.SetPleiadesDefaults();
            configure?.Invoke(options.SerializerOptions);
        });

        return services;
    }
}
