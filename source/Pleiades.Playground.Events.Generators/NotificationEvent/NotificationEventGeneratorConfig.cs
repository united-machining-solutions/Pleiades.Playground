using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Generators.NotificationEvent;

/// <summary>
/// Configuration for NotificationEventGenerator
/// </summary>
public class NotificationEventGeneratorConfig
{
    /// <summary>
    /// Machine Id
    /// </summary>
    [Required]
    public required string MId { get; set; }

    /// <summary>
    /// Number of event cycles. -1 = infinite
    /// </summary>
    public int NumberOfEvents { get; set; } = -1;

    /// <summary>
    /// List of notification events to simulate
    /// </summary>
    public List<NotificationEventConfig> Events { get; set; } = [];
}

public class NotificationEventConfig
{
    /// <summary>
    /// Notification Id (e.g. alarm or message Id)
    /// </summary>
    [Required]
    public required string NotificationId { get; set; }

    /// <summary>
    /// Text to be sent
    /// </summary>
    [Required]
    public required string Title { get; set; }

    /// <summary>
    /// Localized text
    /// </summary>
    [Required]
    public required string LocalizedTitle { get; set; }

    /// <summary>
    /// Raised or Reset
    /// </summary>
    public NotificationAction Action { get; set; } = NotificationAction.Raised;

    /// <summary>
    /// Level (Info, Warning, Error…)
    /// </summary>
    [Required]
    public EventLevel Level { get; set; }

    /// <summary>
    /// Minimum delay after sending. Used as fixed delay when MaxDelay is null.
    /// </summary>
    public TimeSpan Delay { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// When set, the actual delay is randomized between Delay and MaxDelay.
    /// Null (default) preserves the original fixed-delay behavior.
    /// </summary>
    public TimeSpan? MaxDelay { get; init; }

    /// <summary>
    /// Probability [0.0–1.0] that this event fires in a given iteration.
    /// For grouped events (see GroupId), evaluated once per group on the first member encountered.
    /// Default 1.0 always fires, matching existing behavior.
    /// </summary>
    [Range(0.0, 1.0)]
    public double FireProbability { get; init; } = 1.0;

    /// <summary>
    /// Optional group identifier linking a Raised event to its Reset counterpart(s).
    /// When a group is skipped by FireProbability, all events sharing this GroupId are skipped together.
    /// Events without a GroupId are evaluated independently.
    /// </summary>
    public string? GroupId { get; init; }
}
