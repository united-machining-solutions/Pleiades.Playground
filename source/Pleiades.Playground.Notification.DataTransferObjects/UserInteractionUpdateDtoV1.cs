
namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Represents a user interaction update containing new/changed and removed user interactions for a specific service.
/// Analogous to <see cref="NotificationUpdateDtoV1"/> but for user interaction requests.
/// </summary>
public record UserInteractionUpdateDtoV1
{
    /// <summary>
    /// The service/provider identifier that originated this update.
    /// </summary>
    public string ServiceId { get; set; } = string.Empty;

    /// <summary>
    /// User interactions that were added or changed.
    /// </summary>
    public ICollection<UserInteractionDtoV1> NewUserInteractions { get; init; } = [];

    /// <summary>
    /// Notification identifiers of user interactions that were removed.
    /// </summary>
    public ICollection<string> RemoveUserInteractionIds { get; init; } = [];
}
