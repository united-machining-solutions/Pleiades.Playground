using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Common.Logging.Loki.Configuration;

/// <summary>
/// Configuration for a single Loki sink
/// </summary>
public class LokiSinkConfig
{
    /// <summary>
    /// Name of the sink for identification purposes
    /// </summary>
    [Required]
    public required string Name { get; set; }

    /// <summary>
    /// Enable or disable this sink
    /// </summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// Loki endpoint URI
    /// </summary>
    [Required]
    public required Uri Uri { get; set; }

    /// <summary>
    /// Basic authentication credentials (e.g., for Grafana Cloud)
    /// </summary>
    public BasicAuthConfig? BasicAuth { get; set; }

    /// <summary>
    /// Minimum log level for this sink (e.g., "Information", "Warning", "Error")
    /// If not specified, the global minimum level applies
    /// </summary>
    [RegularExpression("Verbose|Debug|Information|Warning|Error|Fatal", 
        ErrorMessage = "MinimumLevel must be one of: Verbose, Debug, Information, Warning, Error, Fatal")]
    public string? MinimumLevel { get; set; }

    /// <summary>
    /// Maximum number of events buffered in memory awaiting post to Loki. Default 5000. The queue is
    /// always bounded: when full (e.g. during a Loki outage) new events are dropped rather than growing
    /// memory unbounded. Raise this per sink for higher-volume services that need more outage buffering.
    /// </summary>
    public int QueueLimit { get; set; } = 5000;

    /// <summary>
    /// Maximum number of events to post in a single batch. Default value is 1000.
    /// </summary>
    public int? BatchPostingLimit { get; set; }

    /// <summary>
    /// Time to wait between checking for event batches. Default value is 2 seconds.
    /// </summary>
    public TimeSpan? Period { get; set; }

    /// <summary>
    /// Additional custom labels to attach to logs sent to this sink
    /// </summary>
    public Dictionary<string, string>? Labels { get; init; }
}
