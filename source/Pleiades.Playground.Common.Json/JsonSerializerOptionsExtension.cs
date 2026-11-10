using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;

namespace Pleiades.Playground.Common.Json;

/// <summary>
/// Extension methods and defaults for <see cref="JsonSerializerOptions"/> used across Pleiades services.
/// </summary>
public static class JsonSerializerOptionsExtension
{
    private static readonly JsonSerializerOptions DefaultOptions = SetPleiadesDefaults(new());

    /// <summary>
    /// Gets the shared default <see cref="JsonSerializerOptions"/> instance with Pleiades conventions
    /// (camelCase, case-insensitive, <see cref="JsonStringEnumConverter"/>).
    /// Do not mutate the returned instance.
    /// </summary>
    public static JsonSerializerOptions PleiadesDefaultJsonOptions => DefaultOptions;

    /// <summary>
    /// Registers Pleiades defaults into <c>IOptions&lt;JsonSerializerOptions&gt;</c> (the default named instance),
    /// for code that resolves <c>IOptions&lt;JsonSerializerOptions&gt;</c> directly (workers, generators, manual
    /// <c>JsonSerializer</c> calls).
    /// <para><b>NOT for ASP.NET Core Minimal API endpoints</b> — endpoint request/response serialization uses
    /// <c>HttpJsonOptions</c>, which this method does <b>not</b> configure. For a Minimal API host call
    /// <c>AddPleiadesHttpJsonOptions()</c> from <c>Pleiades.Playground.Common.AspNetCore</c> instead.</para>
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddPleiadesDefaultJsonOptions(this IServiceCollection services)
        => services.Configure<JsonSerializerOptions>(options => options.SetPleiadesDefaults());

    /// <summary>
    /// Applies all Pleiades defaults <b>including</b> <see cref="JsonStringEnumConverter"/>.
    /// Use <see cref="SetPleiadesBaseDefaults"/> when the enum converter is not wanted.
    /// </summary>
    /// <param name="options">The options instance to configure.</param>
    /// <returns>The same <paramref name="options"/> instance for chaining.</returns>
    public static JsonSerializerOptions SetPleiadesDefaults(this JsonSerializerOptions options)
    {
        _ = options ?? throw new ArgumentNullException(nameof(options));

        options.SetPleiadesBaseDefaults();
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    /// <summary>
    /// Applies Pleiades base defaults (camelCase naming, case-insensitive properties,
    /// <see cref="JsonNumberHandling.AllowNamedFloatingPointLiterals"/>) <b>without</b> adding
    /// <see cref="JsonStringEnumConverter"/>. Use this when numeric enum serialization is required.
    /// </summary>
    /// <param name="options">The options instance to configure.</param>
    /// <returns>The same <paramref name="options"/> instance for chaining.</returns>
    public static JsonSerializerOptions SetPleiadesBaseDefaults(this JsonSerializerOptions options)
    {
        _ = options ?? throw new ArgumentNullException(nameof(options));

        options.NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals;
        options.PropertyNameCaseInsensitive = true;
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
        return options;
    }
}
