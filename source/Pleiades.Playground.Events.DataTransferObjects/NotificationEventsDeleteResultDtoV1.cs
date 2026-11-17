namespace Pleiades.Playground.Events.DataTransferObjects;

/// <summary>
/// Result of deleting the notification events of a machine.
/// </summary>
public sealed record NotificationEventsDeleteResultDtoV1
{
    /// <summary>
    /// Number of notification events deleted.
    /// </summary>
    public long EventsCount { get; init; }
}
