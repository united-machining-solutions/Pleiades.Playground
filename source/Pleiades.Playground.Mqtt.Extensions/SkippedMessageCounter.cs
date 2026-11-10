namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Aggregates messages dropped by MaxPendingMessages so a full queue logs at most once per interval instead of once per message.
/// </summary>
internal sealed class SkippedMessageCounter
{
    internal static readonly TimeSpan LogInterval = TimeSpan.FromMinutes(1);

    private readonly Func<DateTime> _utcNow;
    private readonly object _lock = new();
    private long _count;
    private string _lastTopic = string.Empty;
    private DateTime? _lastLog;

    public SkippedMessageCounter(Func<DateTime>? utcNow = null)
    {
        _utcNow = utcNow ?? (() => DateTime.UtcNow);
    }

    /// <summary>
    /// Registers a dropped message. Returns the drops to log, or null while the last log is younger than <see cref="LogInterval"/>.
    /// </summary>
    public SkippedMessages? Register(string topic)
    {
        lock (_lock)
        {
            _count++;
            _lastTopic = topic;
            var now = _utcNow();
            if (_lastLog is { } lastLog && now - lastLog < LogInterval)
            {
                return null;
            }

            _lastLog = now;
            return Take();
        }
    }

    /// <summary>
    /// Returns the drops not logged yet, or null if there are none.
    /// </summary>
    public SkippedMessages? Flush()
    {
        lock (_lock)
        {
            return _count == 0 ? null : Take();
        }
    }

    private SkippedMessages Take()
    {
        var skipped = new SkippedMessages(_count, _lastTopic);
        _count = 0;
        return skipped;
    }
}

internal readonly record struct SkippedMessages
{
    public SkippedMessages(long count, string lastTopic)
    {
        Count = count;
        LastTopic = lastTopic;
    }

    public long Count { get; }
    public string LastTopic { get; }
}
