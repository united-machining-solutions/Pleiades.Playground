using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// Turns what the machine says over the protocol into values and events of the data model. It sends nothing and
/// reads no file, so the whole mapping can be tested on its own.
/// </summary>
/// <remarks>
/// <code>
/// MaschineLaeuft                 State.Status              MachineryItemState Executing
/// MaschineSteht reason 2         State.Status              MachineryItemState NotExecuting
/// MaschineSteht reason 1         State.Status              MachineryItemState OutOfService
/// src9_server_disconnect         State.Status              MachineryItemState NotAvailable
/// StartNCP                       Channel.1.ChannelState    Active      x-&lt;domain&gt;.WorkMasterMonitoring.ActiveProgram  name
///                                WorkMasterMonitoring.ActiveWorkMaster  name
/// stop while a program runs      Channel.1.ChannelState    Interrupted
/// running again                  Channel.1.ChannelState    Active
/// EndeNCP, ResetNCP              Channel.1.ChannelState    Reset       x-&lt;domain&gt;.WorkMasterMonitoring.ActiveProgram  null
///                                WorkMasterMonitoring.ActiveWorkMaster  null
/// Feedrate                       State.FeedOverride        percent / 100, unit one
/// AktuelleAlarme                 Notification.ActiveAlerts and Notification.AlertRaised; AlertCleared when the
///                                machine runs again or stands without a fault
/// </code>
/// <para>
/// The list <c>Notification.ActiveAlerts</c> goes out before the events that change it, so that a consumer who
/// reads it when an event arrives finds the list the event speaks of.
/// </para>
/// <para>
/// The machine has no work master of its own: its work master is the NC program, as the catalogue of the model
/// says of most machine tools. So <c>WorkMasterMonitoring.ActiveWorkMaster</c> carries the name of the program,
/// the same value as the signal of the manufacturer.
/// </para>
/// <para>
/// The protocol knows no operation mode; the snapshot <c>State.Status</c> says <c>None</c>, the value of the model
/// for a machine without operation modes.
/// </para>
/// <para>
/// The machine sends <c>MaschineSteht</c> whenever a program ends, is aborted or halts, and
/// <c>MaschineLaeuft</c> whenever one starts or goes on (§5.8, §5.9), often just before <c>EndeNCP</c> or
/// <c>StartNCP</c>. Taken alone, each end of a program would look like a halt. So the adapter holds back a
/// running or stopped state for <c>hold</c>: when <c>StartNCP</c>, <c>EndeNCP</c> or <c>ResetNCP</c> comes
/// in that time, the state of the machine is published, but not as a halt or a resumption of the program.
/// The values keep the time the machine gave them; only their publication waits.
/// </para>
/// </remarks>
internal sealed partial class CuttingTranslator(
    MachineIdentity identity,
    TimeZoneInfo machineTimeZone,
    TimeProvider time,
    TimeSpan hold = default,
    ILogger<CuttingTranslator>? logger = null)
{
    /// <summary>
    /// The value of <c>MachineryOperationMode</c>: OPC 40001 gives <c>None</c> for "no operation mode available".
    /// </summary>
    internal const string NoOperationMode = "None";

    /// <summary>The category of an alarm of the machine after NAMUR NE 107: the protocol names none.</summary>
    internal const string AlarmSeverity = "Failure";

    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(1);

    private readonly ILogger _logger = logger ?? NullLogger<CuttingTranslator>.Instance;
    private readonly string _programPath = identity.Signal(Paths.ActiveProgram);
    private readonly Dictionary<string, JsonObject> _activeAlarms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DateTimeOffset> _lastTimestamp = new(StringComparer.Ordinal);
    private bool _programActive;
    private bool _programKnown;
    private bool _alertsKnown;
    private string _program = string.Empty;
    private HeldState? _held;

    /// <summary>The path of the NC program, a signal of the manufacturer.</summary>
    public string ProgramPath => _programPath;

    /// <summary>The alarm numbers of the alarms that are raised and not cleared.</summary>
    public IReadOnlyCollection<string> ActiveAlarms => _activeAlarms.Keys;

    /// <summary>When a held state is due, or null when none is held.</summary>
    public DateTimeOffset? HeldUntil => _held?.Due;

    private DateTimeOffset Now => time.GetUtcNow();

    /// <summary>
    /// The machine answered <c>SRC9CONN</c>. What it has not said yet since the adapter started, its state, its
    /// channel or its program, is <c>null</c>, not known right now: the manifest names them as delivered. So are its
    /// alarms: the protocol has no request for them, and the machine names an alarm only when it comes up. They are
    /// known as none once the machine runs or stands without a fault, and as a list once it names an alarm.
    /// </summary>
    public IReadOnlyList<Publication> Connected()
    {
        var now = Now;
        List<Publication> result = [];
        foreach (var path in new[] { Paths.Status, Paths.ChannelState, _programPath, Paths.ActiveWorkMaster }.Where(p => !_lastTimestamp.ContainsKey(p)))
        {
            result.Add(new ValuePublication(path, null, now));
        }

        result.Add(new ValuePublication(Paths.ActiveAlerts, _alertsKnown ? AlertList() : null, now));
        return Ordered(result);
    }

    /// <summary>
    /// The machine is gone. When it said so itself (<c>src9_server_disconnect</c>), it is known to be off:
    /// <c>NotAvailable</c>, no program runs and no alarm of it stands any more. When it only stopped answering, its
    /// state is unknown, which the binding expresses with <c>Connection.State</c> alone
    /// (<see cref="IPublisher.LostAsync"/>); what the adapter knows of its program stands, for the machine may go
    /// on with it. A held state goes first.
    /// </summary>
    public IReadOnlyList<Publication> Disconnected(bool machineSwitchedOff)
    {
        List<Publication> result = [.. Release(asHalt: true)];
        if (machineSwitchedOff)
        {
            var now = Now;
            result.AddRange(ProgramGone(now));
            result.AddRange(ClearAlarms(now));
            result.Add(Status("NotAvailable", now));
        }

        return Ordered(result);
    }

    /// <summary>
    /// The machine announced itself (<c>src9_server_connect</c>): it has started anew, so no program of before runs
    /// and no alarm of before stands. Its state follows once it is connected again. A held state goes first.
    /// </summary>
    public IReadOnlyList<Publication> Restarted()
    {
        var now = Now;
        return Ordered([.. Release(asHalt: true), .. ProgramGone(now), .. ClearAlarms(now)]);
    }

    /// <summary>No program runs any more, without an end the machine said: the channel is reset.</summary>
    private List<Publication> ProgramGone(DateTimeOffset at)
    {
        var known = _programKnown || _lastTimestamp.ContainsKey(Paths.ChannelState);
        _programActive = false;
        _programKnown = false;
        _program = string.Empty;
        return known
            ? [new ValuePublication(Paths.ChannelState, "Reset", at), .. Program(null, at)]
            : [];
    }

    /// <summary>The NC program, as the signal of the manufacturer and as the work master; null when none runs.</summary>
    private List<Publication> Program(string? program, DateTimeOffset at)
    {
        return [new ValuePublication(_programPath, program, at), new ValuePublication(Paths.ActiveWorkMaster, program, at)];
    }
    /// <summary>The held state, once its time has come and no program notification took it; else nothing.</summary>
    public IReadOnlyList<Publication> Due()
    {
        return _held is { } held && Now >= held.Due ? Ordered(Release(asHalt: true)) : [];
    }

    /// <summary>The values that follow from one notification; empty for one the data model has no place for.</summary>
    public IReadOnlyList<Publication> Translate(CuttingNotification notification)
    {
        ArgumentNullException.ThrowIfNull(notification);
        return Ordered(notification.Name switch
        {
            CuttingNotifications.MachineRunning => Hold(new HeldState(Time(notification.Field(3)), Fault: null, Now + hold)),
            CuttingNotifications.MachineStopped => Stopped(notification),
            CuttingNotifications.StartNcp => ProgramStarted(notification),
            CuttingNotifications.EndNcp or CuttingNotifications.ResetNcp => ProgramEnded(notification),
            CuttingNotifications.CurrentAlarms => Alarm(Time(notification.Field(4)), notification.Field(2).Trim(), notification.Field(3).Trim()),
            CuttingNotifications.Feedrate => Feedrate(Time(notification.Field(3)), notification.Field(2)),
            _ => [],
        });
    }

    /// <summary>
    /// Makes the timestamps of each path strictly increasing. The timestamps of the protocol have whole seconds,
    /// so the end of one program and the start of the next often share one; the value that came later must stay
    /// the later one in the store. The later value moves one millisecond past the earlier. The alert events count
    /// as one path: they share a topic.
    /// </summary>
    private List<Publication> Ordered(List<Publication> publications)
    {
        for (var i = 0; i < publications.Count; i++)
        {
            var publication = publications[i];
            var key = publication switch
            {
                ValuePublication value => value.Path,
                AlertPublication => "events/notifications",
                _ => string.Empty,
            };
            if (_lastTimestamp.TryGetValue(key, out var last) && publication.Timestamp <= last)
            {
                publication = publication with { Timestamp = last + Tick };
                publications[i] = publication;
            }

            _lastTimestamp[key] = publication.Timestamp;
        }

        return publications;
    }

    private List<Publication> Stopped(CuttingNotification notification)
    {
        var reason = notification.Field(4).Trim();
        if (reason is not ("1" or "2"))
        {
            LogUnknownStopReason(reason);
            return [];
        }

        return Hold(new HeldState(Time(notification.Field(3)), Fault: reason == "1", Now + hold));
    }

    /// <summary>
    /// Holds a running or stopped state. One that is held already is published first, in full: it was no
    /// part of a program notification.
    /// </summary>
    private List<Publication> Hold(HeldState state)
    {
        List<Publication> result = [.. Release(asHalt: true)];
        if (hold <= TimeSpan.Zero)
        {
            result.AddRange(Apply(state, asHalt: true));
        }
        else
        {
            _held = state;
        }

        return result;
    }

    /// <summary>
    /// Publishes the held state, if there is one. <paramref name="asHalt"/> false: a program notification
    /// followed; the state of the machine counts, but the channel does not halt or go on for it.
    /// </summary>
    private List<Publication> Release(bool asHalt)
    {
        if (_held is not { } held)
        {
            return [];
        }

        _held = null;
        return Apply(held, asHalt);
    }

    private List<Publication> Apply(HeldState state, bool asHalt)
    {
        var at = state.At;
        switch (state.Fault)
        {
            case null:
            {
                List<Publication> running = [.. ClearAlarms(at), Status("Executing", at)];
                if (asHalt && _programActive)
                {
                    running.Add(new ValuePublication(Paths.ChannelState, "Active", at));
                }

                return running;
            }

            case true:
            {
                List<Publication> fault = [Status("OutOfService", at)];
                if (asHalt && _programActive)
                {
                    fault.Add(new ValuePublication(Paths.ChannelState, "Interrupted", at));
                }

                return fault;
            }

            default:
            {
                List<Publication> stopped = [.. ClearAlarms(at), Status("NotExecuting", at)];
                if (asHalt && _programActive)
                {
                    stopped.Add(new ValuePublication(Paths.ChannelState, "Interrupted", at));
                }

                return stopped;
            }
        }
    }

    private static ValuePublication Status(string itemState, DateTimeOffset at)
    {
        return new ValuePublication(Paths.Status, new JsonObject
        {
            ["MachineryItemState"] = itemState,
            ["MachineryOperationMode"] = NoOperationMode,
        }, at);
    }

    private List<Publication> ProgramStarted(CuttingNotification notification)
    {
        var program = notification.Field(2).Trim();
        if (_programActive)
        {
            LogStartWithoutEnd(_program, program);
        }

        switch (notification.Field(8).Trim())
        {
            case "" or "0":
                break;
            case "1":
                LogReentry(program);
                break;
            case var other:
                LogUnknownStartFlag(other, program);
                break;
        }

        // MaschineLaeuft just before belongs to this start; MaschineSteht just before is a halt of its own.
        List<Publication> result = [.. Release(asHalt: _held is { Fault: not null })];
        var at = Time(notification.Field(6));
        _programActive = true;
        _programKnown = true;
        _program = program;
        result.Add(new ValuePublication(Paths.ChannelState, "Active", at));
        result.AddRange(Program(program.Length == 0 ? null : program, at));
        return result;
    }

    private List<Publication> ProgramEnded(CuttingNotification notification)
    {
        if (_programKnown && !_programActive)
        {
            LogEndWithoutStart(notification.Name, notification.Field(2).Trim());
        }

        // MaschineSteht just before belongs to this end; MaschineLaeuft just before goes on with the program.
        List<Publication> result = [.. Release(asHalt: _held is { Fault: null })];
        var at = Time(notification.Field(6));
        _programActive = false;
        _programKnown = true;
        _program = string.Empty;
        result.Add(new ValuePublication(Paths.ChannelState, "Reset", at));
        result.AddRange(Program(null, at));
        return result;
    }

    /// <summary>
    /// An alarm of the machine: an alert of the model, raised once, whatever the machine repeats. Its alarm number
    /// is the <c>ErrorCode</c>, its text the <c>Message</c>.
    /// </summary>
    private List<Publication> Alarm(DateTimeOffset at, string number, string text)
    {
        if (number.Length == 0 || _activeAlarms.ContainsKey(number))
        {
            return [];
        }

        var alert = new JsonObject
        {
            ["Id"] = Guid.NewGuid().ToString(),
            ["ErrorCode"] = number,
            ["Message"] = text,
            ["Severity"] = AlarmSeverity,
            ["Time"] = MachineBinding.Timestamp(at),
        };
        _activeAlarms[number] = alert;
        _alertsKnown = true;
        return
        [
            new ValuePublication(Paths.ActiveAlerts, AlertList(), at),
            new AlertPublication(Paths.AlertRaised, (JsonObject)alert.DeepClone(), at),
        ];
    }

    private static List<Publication> Feedrate(DateTimeOffset at, string percent)
    {
        return double.TryParse(percent.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            ? [new ValuePublication(Paths.FeedOverride, value / 100.0, at, MachineUnit.One.Name)]
            : [];
    }

    /// <summary>
    /// No alarm stands any more: the list, now known to be empty, then <c>AlertCleared</c> for each alarm that stood.
    /// Nothing when the list is known to be empty already.
    /// </summary>
    private List<Publication> ClearAlarms(DateTimeOffset at)
    {
        if (_alertsKnown && _activeAlarms.Count == 0)
        {
            return [];
        }

        var alarms = _activeAlarms.Values.ToList();
        _activeAlarms.Clear();
        _alertsKnown = true;
        return
        [
            new ValuePublication(Paths.ActiveAlerts, AlertList(), at),
            .. alarms.Select(a => (Publication)new AlertPublication(Paths.AlertCleared, a, at)),
        ];
    }

    /// <summary>The whole list of <c>Notification.ActiveAlerts</c>; <c>[]</c> for none.</summary>
    private JsonArray AlertList()
    {
        return [.. _activeAlarms.Values.Select(a => a.DeepClone())];
    }

    /// <summary>
    /// The time of a timestamp of the machine, in UTC. Without a readable timestamp, or with one in the future,
    /// which the binding does not allow, it is the time of receipt.
    /// </summary>
    private DateTimeOffset Time(string field)
    {
        var now = Now;
        if (!CuttingFormat.TryParseTimestamp(field.Trim(), out var local))
        {
            return now;
        }

        var utc = new DateTimeOffset(
            TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), machineTimeZone));
        return utc > now ? now : utc;
    }

    /// <summary>A running (<c>Fault</c> null) or stopped state that waits for a program notification.</summary>
    /// <param name="At">The time the machine gave it, UTC.</param>
    /// <param name="Fault">Null: running. True: stopped by a fault. False: stopped without one.</param>
    /// <param name="Due">When it is published in full, unless a program notification comes first.</param>
    private readonly record struct HeldState(DateTimeOffset At, bool? Fault, DateTimeOffset Due);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "MaschineSteht with the stop reason '{Reason}'; the protocol knows 1 and 2 (§5.9). Ignored.")]
    private partial void LogUnknownStopReason(string reason);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "StartNCP for {Program} while {Previous} runs: the machine sent no end for it. It counts as ended.")]
    private partial void LogStartWithoutEnd(string previous, string program);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Name} for {Program}, but no program runs.")]
    private partial void LogEndWithoutStart(string name, string program);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "{Program} goes on by re-entry (StartNCP field 8 = 1); the data model has no place for that.")]
    private partial void LogReentry(string program);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "StartNCP for {Program} with '{Flag}' in field 8; the protocol knows 0 (restart) and 1 (re-entry).")]
    private partial void LogUnknownStartFlag(string flag, string program);
}
