using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet.Extensions.ManagedClient;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// Health check that verifies MQTT broker connectivity for a keyed <see cref="IManagedMqttClient"/> instance:
/// <see cref="IManagedMqttClient.IsConnected"/> and a PING round trip.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage(
    "Performance",
    "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated dynamically by DI via factory delegate in AddMqtt(string).")]
internal sealed class KeyedMqttHealthCheck(IManagedMqttClient client, string clientName) : IHealthCheck
{
    /// <inheritdoc />
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        return MqttConnectivity.CheckAsync(client, $"MQTT broker '{clientName}'", cancellationToken);
    }
}
