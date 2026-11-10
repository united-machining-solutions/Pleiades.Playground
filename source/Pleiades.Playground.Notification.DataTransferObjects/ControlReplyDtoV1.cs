
namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Represents a flattened control reply from a user confirmation dialog.
/// </summary>
public record ControlReplyDtoV1
{
    /// <summary>
    /// Type of the control element that was interacted with.
    /// </summary>
    public ControlType ControlType { get; set; }

    /// <summary>
    /// Value entered or selected by the user (serialized as string).
    /// </summary>
    public string Value { get; set; } = string.Empty;
}
