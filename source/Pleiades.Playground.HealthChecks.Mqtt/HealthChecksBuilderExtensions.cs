using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// Extension methods for registering MQTT health checks.
/// </summary>
public static class HealthChecksBuilderExtensions
{
    /// <summary>
    /// Adds a health check that verifies MQTT broker connectivity for the default (non-keyed)
    /// <see cref="IManagedMqttClient"/> registered in DI.
    /// </summary>
    /// <param name="builder">The health checks builder.</param>
    /// <returns>The health checks builder for chaining.</returns>
    public static IHealthChecksBuilder AddMqtt(this IHealthChecksBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.AddCheck<MqttHealthCheck>("mqtt", HealthStatus.Unhealthy, ["mqtt"]);

        return builder;
    }

    /// <summary>
    /// Adds a health check that verifies MQTT broker connectivity for a keyed
    /// <see cref="IManagedMqttClient"/> registered in DI.
    /// Use this overload when multiple MQTT clients are registered with different keys.
    /// </summary>
    /// <param name="builder">The health checks builder.</param>
    /// <param name="clientName">The keyed service name used to register the MQTT client.</param>
    /// <returns>The health checks builder for chaining.</returns>
    public static IHealthChecksBuilder AddMqtt(this IHealthChecksBuilder builder, string clientName)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(clientName);

        builder.Add(new HealthCheckRegistration(
            $"mqtt-{clientName}",
            sp =>
            {
                var client = sp.GetRequiredKeyedService<IManagedMqttClient>(clientName);
                return new KeyedMqttHealthCheck(client, clientName);
            },
            HealthStatus.Unhealthy,
            ["mqtt"]));

        return builder;
    }

    /// <summary>
    /// Adds a health check that reports whether the broker has granted the service's MQTT
    /// <b>subscriptions</b>, and registers the <see cref="MqttSubscriptionReadiness"/> singleton the
    /// worker marks them on.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Use this in addition to <see cref="AddMqtt(IHealthChecksBuilder)"/>, never instead of it.</b>
    /// They answer different questions: <c>AddMqtt()</c> reports
    /// <c>IManagedMqttClient.IsConnected</c>, true from the MQTT CONNECT onwards; this one reports
    /// whether anything would actually be received. MQTT delivers nothing to a client that subscribes
    /// afterwards, so for a service whose whole job is a subscription the connection check reports
    /// healthy for a process that will never do anything.
    /// </para>
    /// <para>
    /// The worker hands the readiness the broker's SUBACKs and marks what
    /// it asked for - see <see cref="MqttSubscriptionReadiness"/> for the lines and for what this check
    /// cannot see.
    /// </para>
    /// </remarks>
    /// <param name="builder">The health checks builder.</param>
    /// <returns>The health checks builder for chaining.</returns>
    public static IHealthChecksBuilder AddMqttSubscription(this IHealthChecksBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        // TryAddSingleton, not AddSingleton: a consumer that registers the readiness object itself -
        // to inject it into a worker built before this line - must get THE SAME instance, or the check
        // reads a second one that nothing ever marks and the service never goes healthy.
        builder.Services.TryAddSingleton<MqttSubscriptionReadiness>();
        builder.AddCheck<MqttSubscriptionHealthCheck>(
            "mqtt-subscription", HealthStatus.Unhealthy, ["mqtt"]);

        return builder;
    }

}
