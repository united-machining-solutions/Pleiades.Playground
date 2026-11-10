namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Represents a strongly-typed MQTT message with its topic, payload, and content type.
/// </summary>
/// <typeparam name="T">The type of the payload contained in the message.</typeparam>
public class MqttMessage<T>
{
    /// <summary>
    /// Topic of the MQTT message.
    /// </summary>
    public string Topic { get; set; } = string.Empty;

    /// <summary>
    /// Payload of the MQTT message.
    /// </summary>
    public T? Payload { get; set; }

    /// <summary>
    /// Content type of the MQTT message payload.
    /// </summary>
    public string? ContentType { get; set; }
}
