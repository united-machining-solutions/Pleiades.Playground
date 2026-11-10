using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Timeseries.Generators.BooleanValue;

public class BooleanValueGeneratorConfig : IValidatableObject
{
    /// <summary>
    /// Base topic to use as a prefix
    /// </summary>
    public string BaseTopic { get; set; } = string.Empty;

    /// <summary>
    /// Topic configs
    /// </summary>
    [Required]
    [MinLength(1, ErrorMessage = "At least one topic configuration is required.")]
    public required List<TopicConfig> Topics { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        ArgumentNullException.ThrowIfNull(validationContext);
        var results = new List<ValidationResult>();

        if (Topics is not null)
        {
            for (var i = 0; i < Topics.Count; i++)
            {
                var topic = Topics[i];
                var ctx = new ValidationContext(topic, validationContext, validationContext.Items)
                {
                    MemberName = $"{nameof(Topics)}[{i}]"
                };
                Validator.TryValidateObject(topic, ctx, results, validateAllProperties: true);

                if (topic?.Values is not null)
                {
                    for (var j = 0; j < topic.Values.Count; j++)
                    {
                        var valueCfg = topic.Values[j];
                        var vctx = new ValidationContext(valueCfg, validationContext, validationContext.Items)
                        {
                            MemberName = $"{nameof(Topics)}[{i}].{nameof(TopicConfig.Values)}[{j}]"
                        };
                        Validator.TryValidateObject(valueCfg, vctx, results, validateAllProperties: true);
                    }
                }
            }
        }

        return results;
    }
}

public class TopicConfig : IValidatableObject
{
    /// <summary>
    /// Topic to publish to
    /// </summary>
    [Required]
    [MinLength(1)]
    public required string Topic { get; set; }

    /// <summary>
    /// Number of runs through the Values list. -1 for infinite amount of runs
    /// </summary>
    public int NumberOfRuns { get; set; } = -1;

    /// <summary>
    /// Values to publish with their associated durations
    /// </summary>
    [Required]
    [MinLength(1, ErrorMessage = "At least one value configuration is required per topic.")]
    public required List<BooleanValueConfig> Values { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        // NumberOfRuns is either -1 (infinite) or >= 1
        if (!(NumberOfRuns == -1 || NumberOfRuns >= 1))
        {
            yield return new ValidationResult(
                "NumberOfRuns must be -1 (infinite) or >= 1.",
                [nameof(NumberOfRuns)]
            );
        }
    }
}

public class BooleanValueConfig : IValidatableObject
{
    /// <summary>
    /// Repeat the value for the whole duration
    /// </summary>
    public bool Repeat { get; set; } = false;

    /// <summary>
    /// Sampling interval between two values. Only active if Repeat is true.
    /// </summary>
    public TimeSpan? SamplingInterval { get; init; }

    /// <summary>
    /// Duration to publish the value. Only active if Repeat is true.
    /// </summary>
    public TimeSpan? Duration { get; init; }

    /// <summary>
    /// Delay after publishing the value before publishing the next one. Only active if Repeat is false.
    /// </summary>
    public TimeSpan? Delay { get; init; }

    /// <summary>
    /// Value to publish
    /// </summary>
    [Required]
    public bool Value { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Repeat)
        {
            if (Duration is null || Duration.Value <= TimeSpan.Zero)
            {
                yield return new ValidationResult(
                    "Duration must be provided and greater than 0 when Repeat is true.",
                    [nameof(Duration), nameof(Repeat)]
                );
            }
            if (SamplingInterval is null || SamplingInterval.Value <= TimeSpan.Zero)
            {
                yield return new ValidationResult(
                    "SamplingInterval must be provided and greater than 0 when Repeat is true.",
                    [nameof(SamplingInterval), nameof(Repeat)]
                );
            }
        }
        else
        {
            if (Delay is null || Delay.Value <= TimeSpan.Zero)
            {
                yield return new ValidationResult(
                    "Delay must be provided and greater than 0 when Repeat is false.",
                    [nameof(Delay), nameof(Repeat)]
                );
            }
        }
    }
}
