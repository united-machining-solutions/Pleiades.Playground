using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// Registers the MCP tools of a service so they serialize with the service's HTTP JSON options.
/// </summary>
/// <remarks>
/// The SDK's <c>WithToolsFromAssembly()</c> without options uses the SDK defaults: a tool then drops
/// <see langword="null"/> properties and ignores every converter the service registered for REST, so the
/// same entity looks different over MCP and over REST. These methods register the tools the
/// same way, but resolve the serializer options from
/// <c>IOptions&lt;Microsoft.AspNetCore.Http.Json.JsonOptions&gt;</c> when the service starts, i.e. exactly what
/// <c>AddPleiadesHttpJsonOptions</c> or <c>ConfigureHttpJsonOptions</c> set up. The options shape the
/// tool results, the parameter binding and the parameter schemas in <c>tools/list</c>.
/// <para>
/// Two additions keep the binding as lenient as the SDK's: numbers are also read from strings
/// (<c>{"take":"50"}</c>, which agents send), reading only, so results still write numbers as REST does; and
/// when the service registers no <see cref="JsonStringEnumConverter"/>, one is added, so agents can pass enum
/// names and see them in the schema. In that case results write enum names where REST writes numbers; a
/// service that needs numeric parity passes its own options.
/// </para>
/// </remarks>
public static class PleiadesMcpServerBuilderExtensions
{
    /// <summary>
    /// Registers every method marked <see cref="McpServerToolAttribute"/> in the types marked
    /// <see cref="McpServerToolTypeAttribute"/> of <paramref name="toolAssembly"/>.
    /// </summary>
    /// <param name="builder">The builder <c>AddPleiadesMcpServer</c> returned.</param>
    /// <param name="toolAssembly">The assembly to scan; the calling assembly when <see langword="null"/>.</param>
    /// <param name="serializerOptions">Opt-out: options to use instead of the service's HTTP JSON options,
    /// for a service whose HTTP options do not suit MCP.</param>
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static IMcpServerBuilder WithPleiadesToolsFromAssembly(
        this IMcpServerBuilder builder,
        Assembly? toolAssembly = null,
        JsonSerializerOptions? serializerOptions = null)
    {
        ArgumentNullException.ThrowIfNull(builder);

        toolAssembly ??= Assembly.GetCallingAssembly();
        return builder.WithPleiadesTools(
            toolAssembly.GetTypes().Where(t => t.GetCustomAttribute<McpServerToolTypeAttribute>() is not null),
            serializerOptions);
    }

    /// <summary>Registers the tool methods of <typeparamref name="TToolType"/>.</summary>
    /// <inheritdoc cref="WithPleiadesToolsFromAssembly" path="/param[@name='builder' or @name='serializerOptions']"/>
    public static IMcpServerBuilder WithPleiadesTools<TToolType>(
        this IMcpServerBuilder builder,
        JsonSerializerOptions? serializerOptions = null) =>
        builder.WithPleiadesTools([typeof(TToolType)], serializerOptions);

    /// <summary>Registers the tool methods of <paramref name="toolTypes"/>.</summary>
    /// <param name="builder">The builder <c>AddPleiadesMcpServer</c> returned.</param>
    /// <param name="toolTypes">The types whose methods marked <see cref="McpServerToolAttribute"/> become tools.</param>
    /// <param name="serializerOptions">Opt-out: options to use instead of the service's HTTP JSON options.</param>
    public static IMcpServerBuilder WithPleiadesTools(
        this IMcpServerBuilder builder,
        IEnumerable<Type> toolTypes,
        JsonSerializerOptions? serializerOptions = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(toolTypes);

        builder.Services.TryAddSingleton<ServiceToolRegistry>();

        // Same discovery as the SDK's WithTools(IEnumerable<Type>): public and non-public, static and instance.
        const BindingFlags methods = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
        foreach (var toolType in toolTypes)
        {
            foreach (var method in toolType.GetMethods(methods).Where(m => m.GetCustomAttribute<McpServerToolAttribute>() is not null))
            {
                builder.Services.AddSingleton(services => CreateTool(services, toolType, method, serializerOptions));
            }
        }

        return builder;
    }

    private static McpServerTool CreateTool(IServiceProvider services, Type toolType, MethodInfo method, JsonSerializerOptions? serializerOptions)
    {
        var options = new McpServerToolCreateOptions
        {
            Services = services,
            SerializerOptions = serializerOptions ?? ToolSerializerOptions(services),
        };

        // Instance tools get a new instance per call, from the request's services, like the SDK does.
        var tool = method.IsStatic
            ? McpServerTool.Create(method, (object?)null, options)
            : McpServerTool.Create(
                method,
                request => request.Services is { } requestServices
                    ? ActivatorUtilities.CreateInstance(requestServices, toolType)
                    : Activator.CreateInstance(toolType)!,
                options);

        services.GetRequiredService<ServiceToolRegistry>().Add(tool);
        return tool;
    }

    // A copy, so the service's own options stay exactly as REST uses them. The SDK freezes the options,
    // which needs a resolver; ASP.NET sets the reflection-based one unless reflection is switched off.
    private static JsonSerializerOptions ToolSerializerOptions(IServiceProvider services)
    {
        var http = services.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        var options = new JsonSerializerOptions(http)
        {
            NumberHandling = http.NumberHandling | JsonNumberHandling.AllowReadingFromString,
            TypeInfoResolver = http.TypeInfoResolver ?? new DefaultJsonTypeInfoResolver(),
        };

        if (!options.Converters.Any(c => c is JsonStringEnumConverter))
        {
            options.Converters.Add(new JsonStringEnumConverter());
        }

        return options;
    }
}
