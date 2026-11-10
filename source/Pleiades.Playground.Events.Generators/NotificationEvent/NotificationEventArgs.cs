using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Generators.NotificationEvent;

public class NotificationEventArgs(NotificationEventDtoV1 data) : EventArgs
{
    public NotificationEventDtoV1 Data { get; } = data;
}
