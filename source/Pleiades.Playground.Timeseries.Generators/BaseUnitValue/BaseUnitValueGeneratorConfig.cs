using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators.BaseUnitValue;

public class BaseUnitValueGeneratorConfig
{
    /// <summary>
    /// Base topic to use as a prefix
    /// </summary>
    public string BaseTopic { get; set; } = string.Empty;

    /// <summary>
    /// Topic configs
    /// </summary>
    [Required]
    public required List<TopicConfig> Topics { get; init; }

    /// <summary>
    /// Optional path to persist incremental state (if null default is used)
    /// </summary>
    public string? PersistenceFilePath { get; set; } = "/data/last_incremental_values.json";
    /// <summary>
    /// Optional interval for periodic persistence. If null, no periodic persistence is performed.
    /// </summary>
    public TimeSpan? PersistenceInterval { get; set; }
}

public class TopicConfig
{
    /// <summary>
    /// Topic to publish to
    /// </summary>
    public required string Topic { get; set; }

    /// <summary>
    /// Delay indicating the timespan between messages
    /// </summary>
    public TimeSpan Delay { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>
    /// BaseUnit
    /// </summary>
    public BaseUnit Unit { get; set; } = BaseUnit.One;

    /// <summary>
    /// Number of messages to publish. -1 for infinite amount of messages
    /// </summary>
    public int NumberOfMessages { get; set; } = -1;

    /// <summary>
    /// Type of the Generator
    /// </summary>
    public BaseUnitValueGeneratorType GeneratorType { get; set; }

    /// <summary>
    /// Scale factor for generated values
    /// </summary>
    public double Scale { get; set; } = 1.0;

    /// <summary>
    /// Offset for generated values
    /// </summary>
    public double Offset { get; set; } = 0.0;

    /// <summary>
    /// Frequency for sine wave generation (only applicable for sine generator)
    /// </summary>
    public double Frequency { get; set; } = 0.1;

    /// <summary>
    /// Noise scale added to sine wave (only applicable for sine generator)
    /// </summary>
    public double NoiseScale { get; set; } = 0.0;

    /// <summary>
    /// Low output value for square wave generation. Only applicable for square generator.
    /// </summary>
    public double LowValue { get; set; } = 0.0;

    /// <summary>
    /// High output value for square wave generation. Only applicable for square generator.
    /// </summary>
    public double HighValue { get; set; } = 1.0;

    /// <summary>
    /// Duration of the high phase per cycle. Only applicable for square generator.
    /// </summary>
    public TimeSpan HighDuration { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Duration of the low phase per cycle. Only applicable for square generator.
    /// </summary>
    public TimeSpan LowDuration { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Start time to set the time at which the value is 0 (only applicable for linear generator)
    /// </summary>
    public DateTime? StartDateTimeUtc { get; set; } = new DateTime(2025, 5, 14, 0, 0, 0, DateTimeKind.Utc);
}
