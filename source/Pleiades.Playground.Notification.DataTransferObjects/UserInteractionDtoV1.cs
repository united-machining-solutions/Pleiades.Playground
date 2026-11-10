using System.Text.Json.Serialization;

namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Represents a user interaction request for a notification that requires user confirmation or input.
/// </summary>
public record UserInteractionDtoV1
{
    /// <summary>
    /// Identifier of the service/provider that owns the notification.
    /// </summary>
    public string ServiceId { get; set; } = string.Empty;

    /// <summary>
    /// Unique id of the notification instance as assigned by the producer.
    /// This is the key used to look the interaction up, to remove it and to reply to it.
    /// </summary>
    public string NotificationId { get; set; } = string.Empty;

    /// <summary>
    /// Human-facing id of the notification, e.g. the PLC code for classic notifications.
    /// Falls back to <see cref="NotificationId"/> when the producer sets no dedicated displayed id.
    /// </summary>
    public string DisplayedId { get; set; } = string.Empty;

    /// <summary>
    /// Type of user interaction action required.
    /// </summary>
    public InteractionType ActionType { get; set; }

    /// <summary>
    /// Type of confirmation dialog to present (optional, used with ConfirmationSimpleAction and ConfirmationDialogAction).
    /// </summary>
    public ConfirmationType? ConfirmationType { get; set; }

    /// <summary>
    /// Notification text displayed to the user.
    /// </summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// Additional info text displayed in the dialog (optional).
    /// </summary>
    public string? InfoText { get; set; }

    /// <summary>
    /// Whether <see cref="InfoText"/> is HTML markup rather than plain text.
    /// </summary>
    public bool IsInfoTextHtml { get; set; }

    /// <summary>
    /// Severity level of the notification.
    /// </summary>
    public NotificationLevel Level { get; set; }

    /// <summary>
    /// Control structures for dialog-based actions (optional, used with ConfirmationDialogAction and ComparisonDialogAction).
    /// </summary>
    public ICollection<ControlStructureDtoV1>? Controls { get; init; } = [];

    /// <summary>
    /// Zero-based display indices of the eco page positions on which this interaction should be shown (optional).
    /// For example, <c>[1, 3]</c> means the interaction appears on eco page displays at index 1 and 3.
    /// </summary>
    public ICollection<int>? DisplayOnEcoPageDisplayIndices { get; init; } = [];
}

/// <summary>
/// Type of confirmation dialog presented to the user.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ConfirmationType
{
    /// <summary>
    /// OK button only.
    /// </summary>
    Ok,

    /// <summary>
    /// Yes and No buttons.
    /// </summary>
    YesNo,

    /// <summary>
    /// OK and Cancel buttons.
    /// </summary>
    OkCancel,

    /// <summary>
    /// Cancel button only.
    /// </summary>
    CancelOnly,
}

/// <summary>
/// Action types that require user interaction (confirmation dialogs, classic actions, comparison dialogs).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum InteractionType
{
    /// <summary>
    /// Simple confirmation action (e.g., single button confirm).
    /// </summary>
    ConfirmationSimpleAction,

    /// <summary>
    /// Confirmation dialog action with control structures (e.g., input fields, checkboxes).
    /// </summary>
    ConfirmationDialogAction,

    /// <summary>
    /// Classic action (legacy confirmation pattern).
    /// </summary>
    ClassicAction,

    /// <summary>
    /// Comparison dialog action with control structures for value comparison.
    /// </summary>
    ComparisonDialogAction,
}
