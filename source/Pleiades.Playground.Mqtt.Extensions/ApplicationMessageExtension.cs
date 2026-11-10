using System.Text.Json;
using MQTTnet;
using Pleiades.Playground.Common.Json;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Provides extension methods for parsing MQTT application messages into typed objects.
/// </summary>
public static class ApplicationMessageExtension
{
    /// <summary>
    /// Parses an <see cref="MqttApplicationMessage"/> into a strongly-typed <see cref="MqttMessage{T}"/> object.
    /// </summary>
    /// <typeparam name="T">The type to which the payload of the message should be deserialized.</typeparam>
    /// <param name="message">The MQTT application message to parse.</param>
    /// <returns>An <see cref="MqttMessage{T}"/> containing the deserialized payload and other message metadata.</returns>
    /// <exception cref="ArgumentNullException">Thrown if the <paramref name="message"/> is null.</exception>
    public static MqttMessage<T> Parse<T>(this MqttApplicationMessage message)
    {
        return message.Parse<T>(JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions);
    }

    /// <summary>
    /// Parses an <see cref="MqttApplicationMessage"/> into a strongly-typed <see cref="MqttMessage{T}"/> object using custom JSON serialization options.
    /// </summary>
    /// <typeparam name="T">The type to which the payload of the message should be deserialized.</typeparam>
    /// <param name="message">The MQTT application message to parse.</param>
    /// <param name="jsonSerializerOptions">The JSON serializer options to use during deserialization.</param>
    /// <returns>An <see cref="MqttMessage{T}"/> containing the deserialized payload and other message metadata.</returns>
    /// <exception cref="ArgumentNullException">Thrown if the <paramref name="message"/> is null.</exception>
    public static MqttMessage<T> Parse<T>(this MqttApplicationMessage message,
        JsonSerializerOptions jsonSerializerOptions)
    {
        _ = message ?? throw new ArgumentNullException(nameof(message));
        var topic = message.Topic;
        var payload = message.ConvertPayloadToString();
        var contentType = message.ContentType?.ToLowerInvariant();

        T? parsedPayload = default;
        if (typeof(T) == typeof(string))
        {
            parsedPayload = (T?)(object)payload;
        }
        else
        {
            // Deserialize for all other types.
            if (payload != null)
            {
                parsedPayload = JsonSerializer.Deserialize<T>(payload, jsonSerializerOptions);
            }
        }
        return new MqttMessage<T> { Topic = topic, Payload = parsedPayload, ContentType = contentType };
    }
}
