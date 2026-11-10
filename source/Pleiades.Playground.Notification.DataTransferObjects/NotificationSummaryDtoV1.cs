using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Data transfer object that provides a summary of notifications in the system.
/// Contains counts by notification level and other relevant summary information.
/// </summary>
public record NotificationSummaryDtoV1: IMessage
{
    /// <summary>
    /// Timestamp of when the Notification occurred.
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Count of notifications with Information level
    /// </summary>
    public int InformationCount { get; set; }

    /// <summary>
    /// Count of notifications with Warning level
    /// </summary>
    public int WarningCount { get; set; }

    /// <summary>
    /// Count of notifications with Error level
    /// </summary>
    public int ErrorCount { get; set; }

    /// <summary>
    /// Count of notifications with ProcessInformation level
    /// </summary>
    public int ProcessInformationCount { get; set; }
}
