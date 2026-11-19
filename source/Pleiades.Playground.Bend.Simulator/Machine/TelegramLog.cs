using Pleiades.Playground.Bend.Protocol.Telegrams;

namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>One telegram the simulator wrote.</summary>
internal sealed record TelegramLogEntry(DateTime Timestamp, string MachineName, string Action, string FileName);

/// <summary>
/// The last telegrams the simulator wrote, for the web page. It listens to the writer.
/// </summary>
internal sealed class TelegramLog
{
    private const int MaxEntries = 1000;

    private readonly Lock _syncRoot = new();
    private readonly Queue<TelegramLogEntry> _entries = new();
    private readonly TimeProvider _time;
    private readonly string _machineName;

    public TelegramLog(SimulatorRuntime runtime, TimeProvider time)
    {
        ArgumentNullException.ThrowIfNull(runtime);
        _time = time ?? throw new ArgumentNullException(nameof(time));
        _machineName = runtime.Identity.ProductInstanceUri;
        runtime.Telegrams.Written += (_, written) => Append(written.Action, written.FileName);
    }

    public event EventHandler<TelegramLogEntry>? EntryAdded;

    public IReadOnlyList<TelegramLogEntry> GetEntries()
    {
        lock (_syncRoot)
        {
            return _entries.ToArray();
        }
    }

    public void Clear()
    {
        lock (_syncRoot)
        {
            _entries.Clear();
        }
    }

    private void Append(string action, string fileName)
    {
        var entry = new TelegramLogEntry(_time.GetLocalNow().DateTime, _machineName, action, fileName);
        lock (_syncRoot)
        {
            if (_entries.Count >= MaxEntries)
            {
                _entries.Dequeue();
            }

            _entries.Enqueue(entry);
        }

        EntryAdded?.Invoke(this, entry);
    }
}
