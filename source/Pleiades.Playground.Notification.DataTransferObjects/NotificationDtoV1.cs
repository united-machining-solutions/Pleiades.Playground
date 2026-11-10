using System.Text.Json.Serialization;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Notification.DataTransferObjects;

public record NotificationDtoV1 : IMessage
{
    /// <summary>
    /// Identifier of the service/provider that raised the notification.
    /// </summary>
    public string ServiceId { get; set; } = string.Empty;

    /// <summary>
    /// Unique id of the notification instance as assigned by the producer.
    /// This is the key used to look the notification up, to remove it and to reply to it.
    /// </summary>
    public string NotificationId { get; set; } = string.Empty;

    /// <summary>
    /// Human-facing id of the notification, e.g. the PLC code for classic notifications.
    /// Falls back to <see cref="NotificationId"/> when the producer sets no dedicated displayed id.
    /// </summary>
    public string DisplayedId { get; set; } = string.Empty;

    /// <summary>
    /// Timestamp of when the Notification occurred.
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Notification text in English.
    /// </summary>
    public string NotificationText { get; set; } = string.Empty;

    /// <summary>
    /// Notification text in localized language.
    /// </summary>
    public string LocalizedNotificationText { get; set; } = string.Empty;

    /// <summary>
    /// Notification text in localized language.
    /// </summary>
    public string LocalizedInfoText { get; set; } = string.Empty;

    /// <summary>
    /// Whether <see cref="LocalizedInfoText"/> is HTML markup rather than plain text.
    /// </summary>
    public bool IsInfoTextHtml { get; set; }

    /// <summary>
    /// Level of the Notification
    /// </summary>
    public NotificationLevel Level { get; set; }

    /// <summary>
    /// Optional lifetime of notification. Causes auto remove after given time.
    /// </summary>
    public int LifetimeSeconds { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NotificationLevel
{
    Information,
    Warning,
    Error,
    ProcessInformation
}
