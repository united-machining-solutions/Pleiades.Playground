namespace Pleiades.Playground.Common.DataTransferObjects;

/// <summary>
/// An event of one machine: it happened once, at <see cref="IMessage.Timestamp"/>, and has an id of its own.
/// </summary>
public interface IMachineEvent : IMessage
{
    /// <summary>Id of the event.</summary>
    public string Id { get; set; }

    /// <summary>Machine id, the level after <c>machines/</c> in the topics of the machine.</summary>
    public string MId { get; set; }
}
