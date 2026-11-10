
namespace Pleiades.Playground.Common.DataTransferObjects;

public interface IEvent : IMessage
{
    public string Id { get; set; }
    public string MId { get; set; }
    public EventLevel Level { get; set; }
}
