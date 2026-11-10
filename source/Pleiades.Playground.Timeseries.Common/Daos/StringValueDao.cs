using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Common.Daos;

/// <summary>
/// StringValueDao extending StringValue with topic
/// </summary>
public record StringValueDao : StringValueDto
{
    /// <summary>
    /// Topic of the MQTT message
    /// </summary>
    [Required]
    public required string Topic { get; init; }
}
