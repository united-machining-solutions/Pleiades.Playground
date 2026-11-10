using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.RestApi;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Timeseries.Persistence;

/// <summary>
/// Comfiguration of persistence service
/// </summary>
internal sealed class Config
{
    /// <summary>
    /// MQTT configuration
    /// </summary>
    [Required]
    public required MqttConfig MqttSource { get; set; }

    /// <summary>
    /// Caching time period
    /// </summary>
    public TimeSpan CachingTime { get; set; }

    /// <summary>
    /// Topics to persist (wildcard is allowed)
    /// </summary>
    [MinLength(1)]
    public required List<string> Topics { get; init; }

    /// <summary>
    /// Timeseries API configuration
    /// </summary>
    public required RestApiConfig TimeseriesApi { get; set; }

    /// <summary>
    /// Loki logging configuration
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
