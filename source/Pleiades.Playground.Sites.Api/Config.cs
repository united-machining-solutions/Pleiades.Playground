using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Sites.Api.Services;

namespace Pleiades.Playground.Sites.Api;

/// <summary>
/// Configuration for the Sites API.
/// </summary>
internal sealed class Config
{
    /// <summary>
    /// MongoDB configuration.
    /// </summary>
    [Required]
    public required MongoDbSettings MongoDb { get; init; }

    /// <summary>
    /// Loki logging configuration.
    /// </summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}
