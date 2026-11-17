using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging.Abstractions;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// Turns what the machine says over the protocol into values of the data model. It sends nothing and reads no
/// file, so the whole mapping can be tested on its own.
/// </summary>
/// <remarks>
/// <code>
/// MaschineLaeuft                 State/MachineryItemState  Executing
/// MaschineSteht reason 2         State/MachineryItemState  NotExecuting
/// MaschineSteht reason 1         State/MachineryItemState  OutOfService
/// src9_server_disconnect         State/MachineryItemState  NotAvailable
/// StartNCP                       Channel/1/ChannelState    Active      Production/ActiveProgram  name
/// stop while a program runs      Channel/1/ChannelState    Interrupted
/// running again                  Channel/1/ChannelState    Active
/// EndeNCP, ResetNCP              Channel/1/ChannelState    Reset       Production/ActiveProgram  empty
/// Feedrate                       State/FeedOverride        percent / 100, unit one
/// AktuelleAlarme                 events/notifications      Raised; Reset when the machine runs again or
///                                                          stands without a fault
/// </code>
/// <para>
/// The protocol knows no operation mode; the data model asks the adapter to report <c>None</c> then.
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
    TimeZoneInfo machineTimeZone,
    TimeProvider time,
    TimeSpan hold = default,
    ILogger<CuttingTranslator>? logger = null)
{
    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(1);

    private readonly ILogger _logger = logger ?? NullLogger<CuttingTranslator>.Instance;
    private readonly Dictionary<string, (string Title, string CorrelationId)> _activeAlarms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DateTime> _lastTimestamp = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Publication> _current = new(StringComparer.Ordinal);
    private bool _programActive;
    private bool _programKnown;
    private string _program = string.Empty;
    private HeldState? _held;

    /// <summary>The alarms that are raised and not reset.</summary>
    public IReadOnlyCollection<string> ActiveAlarms => _activeAlarms.Keys;

    /// <summary>When a held state is due, or null when none is held.</summary>
    public DateTime? HeldUntil => _held?.Due;

    private DateTime Now => time.GetUtcNow().UtcDateTime;

    /// <summary>The machine answered <c>SRC9CONN</c>.</summary>
    public IReadOnlyList<Publication> Connected()
    {
        var now = Now;
        return Ordered(
        [
            new TextPublication(Paths.ConnectionState, "Connected", now),
            new TextPublication(Paths.OperationMode, "None", now),
        ]);
    }

    /// <summary>
    /// The machine is gone. When it said so itself (<c>src9_server_disconnect</c>), it is known to be off:
    /// <c>NotAvailable</c>. When it only stopped answering, its state is unknown, which the data model expresses
    /// with the connection alone.
    /// </summary>
    public IReadOnlyList<Publication> Disconnected(bool machineSwitchedOff)
    {
        var now = Now;
        List<Publication> result = [.. Release(asHalt: true)];
        _programActive = false;
        _programKnown = false;
        result.AddRange(machineSwitchedOff
            ?
            [
                new TextPublication(Paths.ItemState, "NotAvailable", now),
                new TextPublication(Paths.ConnectionState, "Disconnected", now),
            ]
            : [new TextPublication(Paths.ConnectionState, "Disconnected", now)]);
        return Ordered(result);
    }

    /// <summary>The machine answered the heartbeat request.</summary>
    public IReadOnlyList<Publication> Heartbeat(long count)
    {
        return Ordered([new NumberPublication(Paths.Heartbeat, count, BaseUnit.One, Now)]);
    }

    /// <summary>The held state, once its time has come and no program notification took it; else nothing.</summary>
    public IReadOnlyList<Publication> Due()
    {
        return _held is { } held && Now >= held.Due ? Ordered(Release(asHalt: true)) : [];
    }

    /// <summary>
    /// The last value of every topic again, with the time of now, as the simulator of the demo repeats its
    /// states. A reader that missed a value, because it started later or lost the broker for a moment, has it
    /// again within one heartbeat. A repeated value extends what holds; it is no change. A held state that is
    /// due goes first.
    /// </summary>
    public IReadOnlyList<Publication> Repeat()
    {
        var due = Due();
        var now = Now;
        var repeated = Ordered(_current.Values
            .Where(p => p is not NumberPublication { Path: Paths.Heartbeat })
            .Select(p => p with { Timestamp = now })
            .ToList());
        return [.. due, .. repeated];
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
    /// Makes the timestamps of each topic strictly increasing. The timestamps of the protocol have whole seconds,
    /// so the end of one program and the start of the next often share one; the value that came later must stay
    /// the later one in the store. The later value moves one millisecond past the earlier.
    /// </summary>
    private List<Publication> Ordered(List<Publication> publications)
    {
        for (var i = 0; i < publications.Count; i++)
        {
            var publication = publications[i];
            var key = publication switch
            {
                TextPublication text => text.Path,
                NumberPublication number => number.Path,
                AlarmPublication => "events/notifications",
                _ => string.Empty,
            };
            if (_lastTimestamp.TryGetValue(key, out var last) && publication.Timestamp <= last)
            {
                publication = publication with { Timestamp = last + Tick };
                publications[i] = publication;
            }

            _lastTimestamp[key] = publication.Timestamp;
            if (publication is not AlarmPublication)
            {
                _current[key] = publication;
            }
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
                List<Publication> running = [.. ResetAlarms(at), new TextPublication(Paths.ItemState, "Executing", at)];
                if (asHalt && _programActive)
                {
                    running.Add(new TextPublication(Paths.ChannelState, "Active", at));
                }

                return running;
            }

            case true:
            {
                List<Publication> fault = [new TextPublication(Paths.ItemState, "OutOfService", at)];
                if (asHalt && _programActive)
                {
                    fault.Add(new TextPublication(Paths.ChannelState, "Interrupted", at));
                }

                return fault;
            }

            default:
            {
                List<Publication> stopped = [.. ResetAlarms(at), new TextPublication(Paths.ItemState, "NotExecuting", at)];
                if (asHalt && _programActive)
                {
                    stopped.Add(new TextPublication(Paths.ChannelState, "Interrupted", at));
                }

                return stopped;
            }
        }
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
        result.Add(new TextPublication(Paths.ChannelState, "Active", at));
        result.Add(new TextPublication(Paths.ActiveProgram, program, at));
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
        result.Add(new TextPublication(Paths.ChannelState, "Reset", at));
        result.Add(new TextPublication(Paths.ActiveProgram, string.Empty, at));
        return result;
    }

    private List<Publication> Alarm(DateTime at, string number, string text)
    {
        if (number.Length == 0 || _activeAlarms.ContainsKey(number))
        {
            return [];
        }

        var correlationId = NewId();
        _activeAlarms[number] = (text, correlationId);
        return [new AlarmPublication(number, text, NotificationAction.Raised, correlationId, at)];
    }

    private static List<Publication> Feedrate(DateTime at, string percent)
    {
        return double.TryParse(percent.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            ? [new NumberPublication(Paths.FeedOverride, value / 100.0, BaseUnit.One, at)]
            : [];
    }

    private List<Publication> ResetAlarms(DateTime at)
    {
        var reset = _activeAlarms
            .Select(a => (Publication)new AlarmPublication(a.Key, a.Value.Title, NotificationAction.Reset, a.Value.CorrelationId, at))
            .ToList();
        _activeAlarms.Clear();
        return reset;
    }

    /// <summary>
    /// The time of a timestamp of the machine, in UTC. Without a readable timestamp, or with one in the future,
    /// which the binding does not allow, it is the time of receipt.
    /// </summary>
    private DateTime Time(string field)
    {
        var now = Now;
        if (!CuttingFormat.TryParseTimestamp(field.Trim(), out var local))
        {
            return now;
        }

        var utc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), machineTimeZone);
        return utc > now ? now : utc;
    }

    /// <summary>An id the Events API stores as a Mongo ObjectId: 24 hexadecimal digits.</summary>
    private static string NewId() => RandomNumberGenerator.GetHexString(24, lowercase: true);

    /// <summary>A running (<c>Fault</c> null) or stopped state that waits for a program notification.</summary>
    /// <param name="At">The time the machine gave it, UTC.</param>
    /// <param name="Fault">Null: running. True: stopped by a fault. False: stopped without one.</param>
    /// <param name="Due">When it is published in full, unless a program notification comes first.</param>
    private readonly record struct HeldState(DateTime At, bool? Fault, DateTime Due);

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
