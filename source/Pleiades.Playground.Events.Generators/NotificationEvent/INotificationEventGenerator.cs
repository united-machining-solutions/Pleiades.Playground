namespace Pleiades.Playground.Events.Generators.NotificationEvent;

public interface INotificationEventGenerator
{
    event EventHandler<NotificationEventArgs> OnEventGenerated;

    Task StartGeneratingEvents(CancellationToken stoppingToken);
}
