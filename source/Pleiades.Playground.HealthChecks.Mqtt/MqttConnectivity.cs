using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet.Exceptions;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// Connectivity check shared by the default and the keyed MQTT health check.
/// </summary>
/// <remarks>
/// <see cref="IManagedMqttClient.IsConnected"/> alone stays <see langword="true"/> on a stalled connection
/// (broker host gone or not reading) until the OS closes the socket, which can take 15 minutes or more.
/// A PING round trip proves the broker still answers.
/// </remarks>
internal static class MqttConnectivity
{
    internal static readonly TimeSpan PingTimeout = TimeSpan.FromSeconds(5);

    public static async Task<HealthCheckResult> CheckAsync(
        IManagedMqttClient client, string broker, CancellationToken cancellationToken)
    {
        if (!client.IsConnected)
        {
            return HealthCheckResult.Unhealthy($"{broker} is disconnected.");
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(PingTimeout);
            await client.InternalClient.PingAsync(timeout.Token).ConfigureAwait(false);
            return HealthCheckResult.Healthy($"{broker} is connected.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy(
                $"{broker} is connected but did not answer a ping within {PingTimeout.TotalSeconds:F0}s.");
        }
        catch (MqttCommunicationException exception)
        {
            return HealthCheckResult.Unhealthy($"{broker} is connected but does not answer a ping.", exception);
        }
    }
}
