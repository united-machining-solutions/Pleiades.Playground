using System.Security.Cryptography;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>An alarm that stands: raised and not yet reset.</summary>
/// <param name="ConditionId">The condition of the server the alarm belongs to.</param>
/// <param name="CorrelationId">Joins the raising and the resetting of this one occurrence.</param>
/// <param name="Code">The code of the maker.</param>
/// <param name="Title">The text for the operator.</param>
/// <param name="Level">Error, warning or information.</param>
/// <param name="Since">When it was raised.</param>
internal sealed record OpenAlert(string ConditionId, string CorrelationId, string Code, string Title, EventLevel Level, DateTime Since);

/// <summary>What has to be published about an alarm.</summary>
/// <param name="Action">Raised or reset.</param>
/// <param name="Alert">The alarm.</param>
/// <param name="At">When it happened.</param>
internal sealed record AlertChange(NotificationAction Action, OpenAlert Alert, DateTime At);

/// <summary>
/// Follows the alarms of one machine, so that each is raised once and reset once, also across a
/// lost connection: after a reconnect the server lists what still stands, and what is not in that
/// list any more is reset.
/// </summary>
internal sealed class AlertTracker
{
    private readonly Dictionary<string, OpenAlert> _open = new(StringComparer.Ordinal);
    private HashSet<string>? _seenInRefresh;

    /// <summary>Starts with the alarms that stood when the adapter last ran.</summary>
    public AlertTracker(IEnumerable<OpenAlert>? open = null)
    {
        foreach (var alert in open ?? [])
        {
            _open[alert.ConditionId] = alert;
        }
    }

    /// <summary>The alarms that stand.</summary>
    public IReadOnlyCollection<OpenAlert> Open => _open.Values;

    /// <summary>
    /// The level of a severity by OPC 40501-1: 667 and above is an error, 334 and above a warning,
    /// everything below a message.
    /// </summary>
    public static EventLevel LevelOf(int severity) => severity switch
    {
        >= 667 => EventLevel.Error,
        >= 334 => EventLevel.Warning,
        _ => EventLevel.Information,
    };

    /// <summary>An identifier in the form the Events API stores: 24 hexadecimal digits.</summary>
    public static string NewId() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(12));

    /// <summary>
    /// Takes one event of a condition. Returns what to publish, or null if the event changes
    /// nothing: an alarm that already stands, or the end of one that was never raised here.
    /// </summary>
    public AlertChange? Observe(string conditionId, bool active, string code, string title, int severity, DateTime at)
    {
        ArgumentNullException.ThrowIfNull(conditionId);
        if (active)
        {
            _seenInRefresh?.Add(conditionId);
            if (_open.ContainsKey(conditionId))
            {
                return null;
            }

            var raised = new OpenAlert(conditionId, NewId(), code, title, LevelOf(severity), at);
            _open[conditionId] = raised;
            return new AlertChange(NotificationAction.Raised, raised, at);
        }

        return _open.Remove(conditionId, out var open) ? new AlertChange(NotificationAction.Reset, open, at) : null;
    }

    /// <summary>The server begins to list the conditions that still stand.</summary>
    public void BeginRefresh() => _seenInRefresh = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>
    /// The list is complete: every alarm that stood here and was not in it has gone while nobody
    /// listened. Each is reset now.
    /// </summary>
    public IReadOnlyList<AlertChange> EndRefresh(DateTime now)
    {
        if (_seenInRefresh is null)
        {
            return [];
        }

        var gone = _open.Values.Where(alert => !_seenInRefresh.Contains(alert.ConditionId)).ToList();
        foreach (var alert in gone)
        {
            _open.Remove(alert.ConditionId);
        }

        _seenInRefresh = null;
        return [.. gone.Select(alert => new AlertChange(NotificationAction.Reset, alert, now))];
    }
}
