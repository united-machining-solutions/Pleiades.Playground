using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.Logging.Loki.Configuration;

namespace Pleiades.Playground.Timeseries.Api;

/// <summary>
/// Configuration for Timeseries API
/// </summary>
internal sealed class Config
{
    /// <summary>
    /// MongoDB Time-Series-Collection configuration
    /// </summary>
    [Required]
    public required MongoTimeseriesSettings MongoTimeseries { get; init; }

    /// <summary>
    /// Loki logging configuration
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
