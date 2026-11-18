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

    /// <summary>
    /// The Timeseries API, where the values of the machines are stored. Removing a machine deletes its
    /// values there. Without it they stay stored.
    /// </summary>
    public ApiConfig? TimeseriesApi { get; init; }

    /// <summary>
    /// The Events API, where the notifications of the machines are stored. Removing a machine deletes its
    /// notifications there. Without it they stay stored.
    /// </summary>
    public ApiConfig? EventsApi { get; init; }

    /// <summary>
    /// How long a removal waits, after the machine has stopped, before it deletes the stored data. It is to
    /// be longer than the caching time of the timeseries persistence (5 seconds in the stack), so that the
    /// last values the machine published, and its <c>Disconnected</c>, are stored before they are deleted.
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:00", "00:01:00")]
    public TimeSpan DataSettleTime { get; init; } = TimeSpan.FromSeconds(8);

    /// <summary>Loki logging configuration.</summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}

/// <summary>A REST API of the stack the adapter calls.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class ApiConfig
{
    /// <summary>The base address, for example <c>http://timeseries-api:8080</c>.</summary>
    public Uri? Uri { get; init; }
}
