namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>Which way a telegram went.</summary>
internal enum TelegramDirection
{
    /// <summary>From the host to the machine.</summary>
    In,

    /// <summary>From the machine to the host.</summary>
    Out,

    /// <summary>Not sent: the machine is off or no host is connected.</summary>
    Held,

    /// <summary>A line that is not a telegram, or a file that could not be written.</summary>
    Error,
}

/// <summary>One entry of the telegram log.</summary>
/// <param name="Id">A running number.</param>
/// <param name="Time">When.</param>
/// <param name="Direction">Which way.</param>
/// <param name="Name">The command or notification name.</param>
/// <param name="Raw">The line as it stands in the file.</param>
/// <param name="Note">A note, for example why it was held.</param>
internal sealed record TelegramLogEntry(long Id, DateTime Time, TelegramDirection Direction, string Name, string Raw, string Note);

/// <summary>
/// The last telegrams in and out, for the web page.
/// </summary>
internal sealed class TelegramLog(TimeProvider time)
{
    private const int Capacity = 500;

    private readonly Lock _lock = new();
    private readonly LinkedList<TelegramLogEntry> _entries = new();
    private long _nextId;

    /// <summary>Raised after an entry was added, outside the lock.</summary>
    public event EventHandler? Added;

    public void Add(TelegramDirection direction, string name, string raw, string note = "")
    {
        lock (_lock)
        {
            _entries.AddLast(new TelegramLogEntry(++_nextId, time.GetLocalNow().DateTime, direction, name, raw, note));
            while (_entries.Count > Capacity)
            {
                _entries.RemoveFirst();
            }
        }

        Added?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>The entries, newest first.</summary>
    public IReadOnlyList<TelegramLogEntry> Entries()
    {
        lock (_lock)
        {
            return _entries.Reverse().ToList();
        }
    }

    public void Clear()
    {
        lock (_lock)
        {
            _entries.Clear();
        }

        Added?.Invoke(this, EventArgs.Empty);
    }
}
