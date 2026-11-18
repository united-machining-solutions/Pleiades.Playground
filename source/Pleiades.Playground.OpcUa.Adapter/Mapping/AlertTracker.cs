using System.Text.Json.Nodes;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>What happened to an alert: it came up, or it went.</summary>
internal enum AlertAction
{
    /// <summary>The alert came up: <c>Notification.AlertRaised</c>.</summary>
    Raised = 0,

    /// <summary>The alert went: <c>Notification.AlertCleared</c>.</summary>
    Cleared = 1,
}

/// <summary>An alert that stands: raised and not yet cleared.</summary>
/// <param name="ConditionId">The condition of the server the alert belongs to.</param>
/// <param name="Id">The id of this one occurrence, the same in its raising and its clearing.</param>
/// <param name="Code">The code of the maker, <c>ErrorCode</c>.</param>
/// <param name="Message">The text for the operator.</param>
/// <param name="SeverityValue">The severity of OPC UA, 1 to 1000.</param>
/// <param name="Since">When it was raised.</param>
/// <param name="SourceName">The part of the machine it came from, as the server names it.</param>
/// <param name="Category">The category after NAMUR NE 107 as the server gave it, or null to derive it from the severity.</param>
internal sealed record OpenAlert(
    string ConditionId, string Id, string Code, string Message, int SeverityValue, DateTime Since, string? SourceName = null, string? Category = null)
{
    /// <summary>The category after NAMUR NE 107: the server's, or else <see cref="AlertTracker.CategoryOf"/>.</summary>
    public string Severity => Category ?? AlertTracker.CategoryOf(SeverityValue);

    /// <summary>The alert as the model lists it, in <c>Notification.ActiveAlerts</c> and in every alert event.</summary>
    public JsonObject ToJson()
    {
        var json = new JsonObject
        {
            [nameof(Id)] = Id,
            ["ErrorCode"] = Code,
            [nameof(Message)] = Message,
            [nameof(Severity)] = Severity,
            [nameof(SeverityValue)] = SeverityValue,
            ["Time"] = MachineBinding.Timestamp(new DateTimeOffset(DateTime.SpecifyKind(Since, DateTimeKind.Utc))),
        };
        if (!string.IsNullOrEmpty(SourceName))
        {
            json[nameof(SourceName)] = SourceName;
        }

        return json;
    }
}

/// <summary>What has to be published about an alert.</summary>
/// <param name="Action">Raised or cleared.</param>
/// <param name="Alert">The alert.</param>
/// <param name="At">When it happened.</param>
internal sealed record AlertChange(AlertAction Action, OpenAlert Alert, DateTime At);

/// <summary>
/// Follows the alarms of one machine, so that each is raised once and cleared once, also across a
/// lost connection: after a reconnect the server lists what still stands, and what is not in that
/// list any more is cleared.
/// </summary>
/// <remarks>
/// An alarm that stood when the adapter last ran is carried into this run. The first time the server names it as
/// active again, it is raised once more in this run, with its id and the time it came up, so that the events of
/// this run name every alarm that stands: a consumer may end an alarm of an earlier run that the next run does not
/// name again. One the server no longer lists is cleared, as before.
/// </remarks>
internal sealed class AlertTracker
{
    private readonly Dictionary<string, OpenAlert> _open = new(StringComparer.Ordinal);
    private readonly HashSet<string> _carried = new(StringComparer.Ordinal);
    private readonly Func<DateTime> _now;
    private HashSet<string>? _seenInRefresh;

    /// <summary>Starts with the alarms that stood when the adapter last ran.</summary>
    /// <param name="open">The alarms of the last run, carried into this one.</param>
    /// <param name="now">The clock, UTC; the time an alarm of the last run is raised again in this one.</param>
    public AlertTracker(IEnumerable<OpenAlert>? open = null, Func<DateTime>? now = null)
    {
        _now = now ?? (() => DateTime.UtcNow);
        foreach (var alert in open ?? [])
        {
            _open[alert.ConditionId] = alert;
            _carried.Add(alert.ConditionId);
        }
    }

    /// <summary>The alarms that stand, the oldest first.</summary>
    public IReadOnlyList<OpenAlert> Open => [.. _open.Values.OrderBy(alert => alert.Since)];

    /// <summary>
    /// The category of an alert after NAMUR NE 107, from the severity of OPC UA. The model has no rule for it;
    /// this one follows the levels of OPC 40501-1: from 667 a failure, from 334 out of specification, below a
    /// maintenance that is due.
    /// </summary>
    public static string CategoryOf(int severity) => severity switch
    {
        >= 667 => "Failure",
        >= 334 => "OffSpec",
        _ => "MaintenanceRequired",
    };

    /// <summary>A new id of an occurrence: a UUID.</summary>
    public static string NewId() => Guid.NewGuid().ToString();

    /// <summary>
    /// Takes one event of a condition. Returns what to publish, or null if the event changes
    /// nothing: an alarm that already stands, or the end of one that was never raised here.
    /// </summary>
    public AlertChange? Observe(
        string conditionId, bool active, string code, string message, int severity, DateTime at, string? sourceName = null, string? category = null)
    {
        ArgumentNullException.ThrowIfNull(conditionId);
        if (active)
        {
            _seenInRefresh?.Add(conditionId);
            if (_open.TryGetValue(conditionId, out var standing))
            {
                // An alarm of the last run is raised again once in this run; one of this run changes nothing.
                // The event takes the time it is seen in this run, which is not before the run began.
                return _carried.Remove(conditionId) ? new AlertChange(AlertAction.Raised, standing, _now()) : null;
            }

            var raised = new OpenAlert(conditionId, NewId(), code, message, Math.Clamp(severity, 1, 1000), at, sourceName, category);
            _open[conditionId] = raised;
            return new AlertChange(AlertAction.Raised, raised, at);
        }

        _carried.Remove(conditionId);
        return _open.Remove(conditionId, out var open) ? new AlertChange(AlertAction.Cleared, open, at) : null;
    }

    /// <summary>The server begins to list the conditions that still stand.</summary>
    public void BeginRefresh() => _seenInRefresh = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>
    /// The list is complete: every alarm that stood here and was not in it has gone while nobody
    /// listened. Each is cleared now.
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
            _carried.Remove(alert.ConditionId);
        }

        _seenInRefresh = null;
        return [.. gone.Select(alert => new AlertChange(AlertAction.Cleared, alert, now))];
    }

    /// <summary>
    /// Takes the whole list of the alerts that stand, as a server lists them in <c>Notification.ActiveAlerts</c>:
    /// an alert that is new is raised, one that is no longer in the list is cleared. The id of an alert in
    /// the list is its condition. Returns the raisings in the order of the list, then the clearings.
    /// </summary>
    /// <param name="list">The alerts that stand now.</param>
    /// <param name="now">The time, UTC: of a clearing, and of a raising whose alert has no time or one in the future.</param>
    public IReadOnlyList<AlertChange> Reconcile(IEnumerable<ListedAlert> list, DateTime now)
    {
        ArgumentNullException.ThrowIfNull(list);
        var changes = new List<AlertChange>();
        BeginRefresh();
        foreach (var alert in list)
        {
            var at = alert.Time is { } time && time <= now ? time : now;
            if (Observe(alert.Id, active: true, alert.ErrorCode, alert.Message, alert.SeverityValue, at, alert.SourceName, alert.Severity) is { } change)
            {
                changes.Add(change);
            }
        }

        changes.AddRange(EndRefresh(now));
        return changes;
    }
}
