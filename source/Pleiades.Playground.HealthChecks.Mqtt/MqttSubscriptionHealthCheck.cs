using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet.Client;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// Reports whether the broker has granted an MQTT consumer's subscriptions and its worker is running —
/// see <see cref="MqttSubscriptionReadiness"/> for why <c>AddMqtt()</c> alone is not that.
/// </summary>
/// <remarks>
/// Registered <b>Unhealthy</b> rather than Degraded on purpose. A consumer with no subscription is
/// not a degraded consumer, it is one that receives nothing, and <c>depends_on: service_healthy</c>
/// has to mean "will do its job" for the dependency to be worth declaring.
/// </remarks>
[System.Diagnostics.CodeAnalysis.SuppressMessage(
    "Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated by DI via AddCheck<T>.")]
internal sealed class MqttSubscriptionHealthCheck(MqttSubscriptionReadiness readiness) : IHealthCheck
{
    /// <inheritdoc />
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var fault = readiness.Fault;
        if (fault is not null)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(
                $"The MQTT worker stopped and nothing is being consumed: {fault}"));
        }

        var requested = readiness.RequestedTopics;
        if (requested is not null)
        {
            return Task.FromResult(FromTheBrokersAnswer(requested));
        }

        var topic = readiness.SubscribedTopic;
        return Task.FromResult(topic is null
            ? HealthCheckResult.Unhealthy(
                "Not subscribed yet. The broker connection may be up, but nothing published now would " +
                "be received - MQTT delivers nothing to a client that subscribes afterwards.")
            : HealthCheckResult.Healthy($"Subscribed to '{topic}' and consuming."));
    }

    private HealthCheckResult FromTheBrokersAnswer(IReadOnlyList<string> requested)
    {
        if (requested.Count == 0)
        {
            return HealthCheckResult.Healthy("No topic filter requested, so there is nothing to receive.");
        }

        var answers = requested.Select(filter => (Filter: filter, Code: readiness.GetResultCode(filter))).ToList();
        var notGranted = answers.Where(answer => !MqttSubscriptionReadiness.IsGranted(answer.Code)).ToList();

        return notGranted.Count == 0
            ? HealthCheckResult.Healthy($"The broker granted every requested topic filter: {Describe(answers)}.")
            : HealthCheckResult.Unhealthy(
                $"The broker has not granted {notGranted.Count} of {answers.Count} requested topic filters: " +
                $"{Describe(notGranted)}. SubscribeAsync only queues a subscription, and MQTT delivers " +
                "nothing on a filter the broker has not granted.");
    }

    private static string Describe(IEnumerable<(string Filter, MqttClientSubscribeResultCode? Code)> answers) =>
        string.Join(", ", answers.Select(answer => $"'{answer.Filter}' ({answer.Code?.ToString() ?? "no SUBACK"})"));
}
