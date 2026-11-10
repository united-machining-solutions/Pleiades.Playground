using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Common.Daos;

/// <summary>
/// BaseUnitValueDao extending BaseUnitValue with topic
/// </summary>
public record BaseUnitValueDao : BaseUnitValueDto
{
    /// <summary>
    /// Topic of the MQTT message
    /// </summary>
    [Required]
    public required string Topic { get; init; }
}
