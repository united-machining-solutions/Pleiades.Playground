using System.Collections.ObjectModel;
using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Common.RestApi;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Events.Persistence;

/// <summary>
/// Configuration options for the persistence service.
/// </summary>
public class Config
{
    /// <summary>
    /// MQTT configuration
    /// </summary>
    [Required]
    public required MqttConfig MqttSource { get; set; }

    /// <summary>
    /// Topics to persist (wildcard is allowed)
    /// </summary>
    [MinLength(1)]
    public Collection<string> Topics { get; } = [];

    /// <summary>
    /// Events API configuration
    /// </summary>
    [Required]
    public required RestApiConfig EventsApi { get; set; }

    /// <summary>
    /// Loki logging configuration
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
