
namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Represents a notification update containing new and removed notifications for a specific service.
/// Analogous to the middleware <c>NotificationDifference</c> protobuf message, but for REST/SSE consumers.
/// </summary>
public record NotificationUpdateDtoV1
{
    /// <summary>
    /// The service/provider identifier that originated this update.
    /// </summary>
    public string ServiceId { get; set; } = string.Empty;

    /// <summary>
    /// Notifications that were added or changed.
    /// </summary>
    public ICollection<NotificationDtoV1> NewNotifications { get; init; } = [];

    /// <summary>
    /// Notification identifiers that were removed.
    /// </summary>
    public ICollection<string> RemoveNotificationIds { get; init; } = [];
}
