using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet.Extensions.ManagedClient;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// Health check that verifies MQTT broker connectivity: <see cref="IManagedMqttClient.IsConnected"/> and a PING round trip.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage(
    "Performance",
    "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated dynamically by DI via AddCheck<T>.")]
internal sealed class MqttHealthCheck(IManagedMqttClient client) : IHealthCheck
{
    /// <inheritdoc />
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        return MqttConnectivity.CheckAsync(client, "MQTT broker", cancellationToken);
    }
}
