using System.Text.Json.Serialization;

namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Represents a confirmation reply received from a middleware consumer via SSE.
/// </summary>
public record ConfirmationReplyDtoV1
{
    /// <summary>
    /// Timestamp of when the confirmation was received.
    /// </summary>
    public DateTime? Timestamp { get; set; }

    /// <summary>
    /// Service identifier of the notification producer.
    /// </summary>
    public string ServiceId { get; set; } = string.Empty;

    /// <summary>
    /// Notification identifier that was confirmed.
    /// </summary>
    public string NotificationId { get; set; } = string.Empty;

    /// <summary>
    /// Result of the user's confirmation action.
    /// </summary>
    public ConfirmationResult Result { get; set; }

    /// <summary>
    /// Error message if the confirmation failed (optional).
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Control replies from the confirmation dialog (optional, contains user-entered values).
    /// </summary>
    public ICollection<ControlReplyDtoV1> ControlReplies { get; init; } = [];
}

/// <summary>
/// Result of a user confirmation action.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ConfirmationResult
{
    /// <summary>
    /// No result (default).
    /// </summary>
    None,

    /// <summary>
    /// User confirmed with OK.
    /// </summary>
    Okay,

    /// <summary>
    /// User cancelled.
    /// </summary>
    Cancel,

    /// <summary>
    /// User aborted.
    /// </summary>
    Abort,

    /// <summary>
    /// User chose retry.
    /// </summary>
    Retry,

    /// <summary>
    /// User chose ignore.
    /// </summary>
    Ignore,

    /// <summary>
    /// User confirmed with Yes.
    /// </summary>
    Yes,

    /// <summary>
    /// User chose No.
    /// </summary>
    No,

    /// <summary>
    /// User chose try again.
    /// </summary>
    TryAgain,

    /// <summary>
    /// User chose continue.
    /// </summary>
    Continue,
}
