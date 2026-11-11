using MQTTnet.Packets;
using MQTTnet.Protocol;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Provides the single-topic overloads of an <see cref="IManagedMqttClient"/>.
/// </summary>
public static class ManagedMqttClientExtension
{
    /// <summary>
    /// Queues the subscription to one topic filter.
    /// </summary>
    /// <param name="client">The managed client.</param>
    /// <param name="topic">The topic filter to subscribe to.</param>
    /// <param name="qualityOfServiceLevel">The maximum quality of service the broker delivers with.</param>
    /// <returns>A task that completes once the subscription is queued, not once it is granted.</returns>
    public static Task SubscribeAsync(
        this IManagedMqttClient client,
        string topic,
        MqttQualityOfServiceLevel qualityOfServiceLevel = MqttQualityOfServiceLevel.AtMostOnce)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(topic);

        return client.SubscribeAsync([new MqttTopicFilter { Topic = topic, QualityOfServiceLevel = qualityOfServiceLevel }]);
    }

    /// <summary>
    /// Queues the removal of the subscription to one topic filter.
    /// </summary>
    /// <param name="client">The managed client.</param>
    /// <param name="topic">The topic filter exactly as it was subscribed.</param>
    /// <returns>A task that completes once the removal is queued.</returns>
    public static Task UnsubscribeAsync(this IManagedMqttClient client, string topic)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(topic);

        return client.UnsubscribeAsync([topic]);
    }
}
