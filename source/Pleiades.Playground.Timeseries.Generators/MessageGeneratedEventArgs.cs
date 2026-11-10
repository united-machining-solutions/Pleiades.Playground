namespace Pleiades.Playground.Timeseries.Generators;

public class MessageGeneratedEventArgs<TMessage> : EventArgs
{
    public required string Topic { get; init; }
    public required TMessage Message { get; init; }
}
