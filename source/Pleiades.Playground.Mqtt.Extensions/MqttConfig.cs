using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Common MQTT config for connecting to MQTT broker
/// </summary>
public class MqttConfig
{
    /// <summary>
    /// connection string
    /// </summary>
    [Required]
    public string ConnectionString { get; set; } = string.Empty;

    /// <summary>
    /// user
    /// </summary>
    public string User { get; set; } = string.Empty;

    /// <summary>
    /// password
    /// </summary>
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// Use TLS flag
    /// </summary>
    public bool UseTls { get; set; } = false;

    /// <summary>
    /// Connect over WebSocket with TLS, whatever the scheme of the connection string says.
    /// </summary>
    public bool UseSecureWebSocket { get; set; } = false;

    /// <summary>
    /// MQTT Version
    /// </summary>
    public MQTTnet.Formatter.MqttProtocolVersion ProtocolVersion { get; set; } = MQTTnet.Formatter.MqttProtocolVersion.V500;

    /// <summary>
    /// Optional deterministic MQTT ClientId. When null or whitespace, MQTTnet generates a random GUID per connection
    /// (default behavior). Set to a stable value (e.g. service name + host) when used together with
    /// <see cref="CleanSession"/> = <c>false</c> so the broker can recognize the client across reconnects and replay
    /// the persistent-session backlog of QoS &gt;= 1 subscriptions.
    /// </summary>
    public string? ClientId { get; set; }

    /// <summary>
    /// Controls the MQTT Clean Session / Clean Start flag. Default is <c>true</c> (matches MQTTnet default and previous
    /// behavior). Set to <c>false</c> together with a stable <see cref="ClientId"/> to receive QoS &gt;= 1 messages that
    /// were published while the client was offline.
    /// </summary>
    public bool CleanSession { get; set; } = true;

    /// <summary>
    /// Optional maximum number of queued outgoing messages. When exceeded, the oldest message is dropped and a warning
    /// is logged. Default is <c>null</c>: the queue is unbounded.
    /// </summary>
    public int? MaxPendingMessages { get; set; }
}
