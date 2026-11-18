using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Sites.Api.Services;

/// <summary>
/// MongoDB settings.
/// </summary>
internal sealed class MongoDbSettings
{
    /// <summary>
    /// MongoDB connection string.
    /// </summary>
    [Required]
    public required string ConnectionString { get; init; } = "mongodb://localhost:27017";

    /// <summary>
    /// Database name.
    /// </summary>
    [Required]
    public required string DatabaseName { get; init; } = "Sites";

    /// <summary>
    /// Collection of the sites.
    /// </summary>
    public string SiteCollection { get; init; } = "Site";

    /// <summary>
    /// Collection of the placements, one document per machine.
    /// </summary>
    public string PlacementCollection { get; init; } = "Placement";

    /// <summary>
    /// Whether to ensure the MongoDB indexes exist on startup.
    /// </summary>
    public bool EnsureIndexesOnStartup { get; init; } = true;
}
