using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Common.Daos;

/// <summary>
/// BooleanValueDao extending BaseUnitValue with topic
/// </summary>
public record BooleanValueDao : BooleanValueDto
{
    /// <summary>
    /// Topic of the MQTT message
    /// </summary>
    [Required]
    public required string Topic { get; init; }
}
