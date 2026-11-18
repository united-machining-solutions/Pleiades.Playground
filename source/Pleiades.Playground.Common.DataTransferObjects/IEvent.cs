namespace Pleiades.Playground.Common.DataTransferObjects;

/// <summary>
/// An event of one machine that carries a level, such as a notification.
/// </summary>
public interface IEvent : IMachineEvent
{
    public EventLevel Level { get; set; }
}
