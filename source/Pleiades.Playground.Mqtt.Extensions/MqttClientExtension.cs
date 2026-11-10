using System.Text.Json;
using MQTTnet;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Protocol;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Provides extension methods for publishing messages using an <see cref="IManagedMqttClient"/>.
/// </summary>
public static class MqttClientExtension
{
    /// <summary>
    /// Publishes a message of type <typeparamref name="T"/> to the specified topic with a default quality of service level of "AtMostOnce".
    /// </summary>
    /// <typeparam name="T">The type of the message being published. Must implement <see cref="IMessage"/>.</typeparam>
    /// <param name="client">The MQTT client used to publish the message.</param>
    /// <param name="topic">The topic to which the message will be published.</param>
    /// <param name="message">The message payload to publish.</param>
    /// <returns>A task representing the asynchronous publish operation.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="client"/>, <paramref name="topic"/>, or <paramref name="message"/> is null.</exception>
    public static Task Publish<T>(this IManagedMqttClient client, string topic, T message) where T : IMessage
    {
        return client.Publish(topic, message, MqttQualityOfServiceLevel.AtMostOnce);
    }

    /// <summary>
    /// Publishes a message of type <typeparamref name="T"/> to the specified topic with the specified quality of service level.
    /// </summary>
    /// <typeparam name="T">The type of the message being published. Must implement <see cref="IMessage"/>.</typeparam>
    /// <param name="client">The MQTT client used to publish the message.</param>
    /// <param name="topic">The topic to which the message will be published.</param>
    /// <param name="message">The message payload to publish.</param>
    /// <param name="qos">The quality of service level for the message delivery.</param>
    /// <returns>A task representing the asynchronous publish operation.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="client"/>, <paramref name="topic"/>, or <paramref name="message"/> is null.</exception>
    public static Task Publish<T>(this IManagedMqttClient client, string topic, T message, MqttQualityOfServiceLevel qos) where T : IMessage
    {
        _ = client ?? throw new ArgumentNullException(nameof(client));
        _ = topic ?? throw new ArgumentNullException(nameof(topic));
        _ = message ?? throw new ArgumentNullException(nameof(message));

        var payloadJson = JsonSerializer.Serialize(message, JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions);
        var contentType = message.GetType().Name.ToLowerInvariant();

        return client.Publish(topic, payloadJson, contentType, qos, false);
    }

    /// <summary>
    /// Publishes a message of type <typeparamref name="T"/> to the specified topic with the specified quality of service level and retain flag.
    /// </summary>
    /// <typeparam name="T">The type of the message being published. Must implement <see cref="IMessage"/>.</typeparam>
    /// <param name="client">The MQTT client used to publish the message.</param>
    /// <param name="topic">The topic to which the message will be published.</param>
    /// <param name="message">The message payload to publish.</param>
    /// <param name="qos">The quality of service level for the message delivery.</param>
    /// <param name="retainMessage">Indicates whether the message should be retained on the broker.</param>
    /// <returns>A task representing the asynchronous publish operation.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="client"/>, <paramref name="topic"/>, or <paramref name="message"/> is null.</exception>
    public static Task Publish<T>(this IManagedMqttClient client, string topic, T message, MqttQualityOfServiceLevel qos, bool retainMessage) where T : IMessage
    {
        _ = client ?? throw new ArgumentNullException(nameof(client));
        _ = topic ?? throw new ArgumentNullException(nameof(topic));
        _ = message ?? throw new ArgumentNullException(nameof(message));

        var payloadJson = JsonSerializer.Serialize(message, JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions);
        var contentType = message.GetType().Name.ToLowerInvariant();

        return client.Publish(topic, payloadJson, contentType, qos, retainMessage);
    }

    /// <summary>
    /// Publishes a raw message to the specified topic with the specified parameters.
    /// </summary>
    /// <param name="client">The MQTT client used to publish the message.</param>
    /// <param name="topic">The topic to which the message will be published.</param>
    /// <param name="payload">The raw payload of the message.</param>
    /// <param name="contentType">The content type of the payload.</param>
    /// <param name="qos">The quality of service level for the message delivery.</param>
    /// <param name="retainMessage">Indicates whether the message should be retained on the broker.</param>
    /// <returns>A task representing the asynchronous publish operation.</returns>
    /// <exception cref="ArgumentNullException">Thrown if <paramref name="client"/> is null.</exception>
    public static Task Publish(this IManagedMqttClient client, string topic, string payload, string contentType, MqttQualityOfServiceLevel qos, bool retainMessage)
    {
        _ = client ?? throw new ArgumentNullException(nameof(client));

        var mqttMessage = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(payload)
            .WithContentType(contentType)
            .WithQualityOfServiceLevel(qos)
            .WithRetainFlag(retainMessage)
            .Build();

        return client.EnqueueAsync(mqttMessage);
    }
}
