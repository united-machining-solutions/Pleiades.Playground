namespace Pleiades.Playground.Timeseries.DataTransferObjects;

/// <summary>
/// Represents a distinct set of topics (tags) that have data points stored within a specified time range.
/// Separated by value type.
/// </summary>
public record class TopicsDto
{
    /// <summary>
    /// Base unit value topics.
    /// </summary>
    public List<string> BaseUnitTopics { get; init; } = [];

    /// <summary>
    /// String value topics.
    /// </summary>
    public List<string> StringTopics { get; init; } = [];

    /// <summary>
    /// Boolean value topics.
    /// </summary>
    public List<string> BooleanTopics { get; init; } = [];
}
