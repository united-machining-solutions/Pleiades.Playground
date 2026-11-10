using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Events.Api.Services;

namespace Pleiades.Playground.Events.Api;

/// <summary>
/// Configuration for Events API
/// </summary>
internal sealed class Config
{
    /// <summary>
    /// MongoDB configuration
    /// </summary>
    [Required]
    public required MongoDbSettings MongoDb { get; init; }

    /// <summary>
    /// Loki logging configuration
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
