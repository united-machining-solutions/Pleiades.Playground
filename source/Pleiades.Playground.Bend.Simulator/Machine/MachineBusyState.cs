namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>
/// Set while an automatic processing runs. Every other action is refused then.
/// </summary>
internal sealed class MachineBusyState
{
    private int _busy;

    public bool IsBusy => Volatile.Read(ref _busy) == 1;

    public bool TryMarkBusy() => Interlocked.CompareExchange(ref _busy, 1, 0) == 0;

    public void MarkIdle() => Volatile.Write(ref _busy, 0);
}
