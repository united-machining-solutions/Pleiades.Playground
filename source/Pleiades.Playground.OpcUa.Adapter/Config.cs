using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.OpcUa.Adapter;

/// <summary>
/// Configuration of the OPC UA adapter. One instance serves every registered machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>MQTT broker the adapter publishes to.</summary>
    [Required]
    public required MqttConfig MqttDestination { get; set; }

    /// <summary>
    /// Where the registrations, the open alarms and the certificates of the adapter are kept. It
    /// must outlive the container, or every machine has to be registered again.
    /// </summary>
    [Required]
    public string DataDirectory { get; init; } = "/data";

    /// <summary>The interval of <c>Connection/Heartbeat</c>. A reader takes a machine as silent after 30 seconds.</summary>
    [Range(typeof(TimeSpan), "00:00:01", "00:00:30")]
    public TimeSpan HeartbeatInterval { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>How often the server is asked for new values, and how often it reports them.</summary>
    [Range(typeof(TimeSpan), "00:00:00.100", "00:01:00")]
    public TimeSpan SamplingInterval { get; init; } = TimeSpan.FromMilliseconds(500);

    /// <summary>The application URI of the adapter as an OPC UA client. It is part of its certificate.</summary>
    [Required]
    public string ApplicationUri { get; init; } = "urn:pleiades:playground:opcua:adapter";

    /// <summary>Loki logging configuration.</summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
