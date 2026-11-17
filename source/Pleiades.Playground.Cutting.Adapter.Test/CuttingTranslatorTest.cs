
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Adapter.Test;

[TestClass]
public sealed class CuttingTranslatorTest
{
    private static readonly DateTimeOffset Now = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);

    private readonly CuttingTranslator _translator = new(TimeZoneInfo.Utc, new FixedTime(Now));

    [TestMethod]
    public void StartNcp_TheChannelIsActiveAndTheProgramIsNamed()
    {
        var result = Translate(CuttingNotifications.StartNcp, "1", "PROG_A", "3", "ORDER", "1", "17.11.2026-09:30:00", "JOB", "0");

        AssertText(result, Paths.ChannelState, "Active");
        AssertText(result, Paths.ActiveProgram, "PROG_A");
        Assert.AreEqual(new DateTime(2026, 11, 17, 9, 30, 0, DateTimeKind.Utc), result[0].Timestamp);
    }

    [TestMethod]
    public void EndNcp_TheChannelIsResetAndNoProgramRuns()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG_A");

        var result = Translate(CuttingNotifications.EndNcp, "1", "PROG_A");

        AssertText(result, Paths.ChannelState, "Reset");
        AssertText(result, Paths.ActiveProgram, string.Empty);
    }

    [TestMethod]
    [DataRow(CuttingNotifications.MachineRunning, "", "Executing")]
    [DataRow(CuttingNotifications.MachineStopped, "2", "NotExecuting")]
    [DataRow(CuttingNotifications.MachineStopped, "1", "OutOfService")]
    public void RunningAndStopped_GiveTheMachineryItemState(string name, string reason, string state)
    {
        var result = Translate(name, "1", "PROG", "17.11.2026-09:00:00", reason);

        AssertText(result, Paths.ItemState, state);
    }

    [TestMethod]
    public void AFault_WhileAProgramRuns_InterruptsTheChannel_AndRunningAgainResumesItAndResetsTheAlarm()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        var fault = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "1");
        var alarm = Translate(CuttingNotifications.CurrentAlarms, "1", "10001234", "Nozzle damaged", "17.11.2026-09:10:00");
        var again = Translate(CuttingNotifications.CurrentAlarms, "1", "10001234", "Nozzle damaged", "17.11.2026-09:10:00");
        var running = Translate(CuttingNotifications.MachineRunning, "1", "PROG", "");

        AssertText(fault, Paths.ChannelState, "Interrupted");
        var raised = (AlarmPublication)alarm.Single();
        Assert.AreEqual(NotificationAction.Raised, raised.Action);
        Assert.AreEqual("10001234", raised.NotificationId);
        Assert.IsEmpty(again, "An alarm the machine repeats is raised once.");
        var reset = running.OfType<AlarmPublication>().Single();
        Assert.AreEqual(NotificationAction.Reset, reset.Action);
        Assert.AreEqual(raised.CorrelationId, reset.CorrelationId, "Raised and reset belong together.");
        AssertText(running, Paths.ChannelState, "Active");
        Assert.IsEmpty(_translator.ActiveAlarms);
    }

    [TestMethod]
    public void AnAlarmId_IsWhatTheEventsApiStores()
    {
        var alarm = (AlarmPublication)Translate(CuttingNotifications.CurrentAlarms, "1", "1", "Text", "").Single();

        Assert.MatchesRegex("^[0-9a-f]{24}$", alarm.CorrelationId);
    }

    [TestMethod]
    public void Feedrate_InPercent_BecomesAFractionOfOne()
    {
        var result = Translate(CuttingNotifications.Feedrate, "1", "85", "17.11.2026-09:00:00");

        var feed = (NumberPublication)result.Single();
        Assert.AreEqual(Paths.FeedOverride, feed.Path);
        Assert.AreEqual(0.85, feed.Value, 1e-9);
        Assert.AreEqual(BaseUnit.One, feed.Unit);
    }

    [TestMethod]
    public void ATimestampOfTheMachine_IsReadInItsTimeZone()
    {
        var berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        var translator = new CuttingTranslator(berlin, new FixedTime(Now));

        var result = translator.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "P", "17.11.2026-09:00:00"));

        Assert.AreEqual(new DateTime(2026, 11, 17, 8, 0, 0, DateTimeKind.Utc), result[^1].Timestamp);
    }

    [TestMethod]
    [DataRow("17.11.2026-12:00:00", DisplayName = "in the future")]
    [DataRow("", DisplayName = "missing")]
    [DataRow("yesterday", DisplayName = "unreadable")]
    public void ATimestampTheBindingDoesNotAllow_BecomesTheTimeOfReceipt(string timestamp)
    {
        var result = Translate(CuttingNotifications.MachineRunning, "1", "P", timestamp);

        Assert.AreEqual(Now.UtcDateTime, result[^1].Timestamp);
    }

    [TestMethod]
    public void TheEndOfOneProgramAndTheStartOfTheNextInOneSecond_KeepTheirOrder()
    {
        var end = Translate(CuttingNotifications.EndNcp, "1", "PROG_A", "", "", "1", "17.11.2026-09:30:00");
        var start = Translate(CuttingNotifications.StartNcp, "1", "PROG_B", "", "", "1", "17.11.2026-09:30:00");

        var reset = end.OfType<TextPublication>().Single(p => p.Path == Paths.ChannelState);
        var active = start.OfType<TextPublication>().Single(p => p.Path == Paths.ChannelState);
        Assert.IsGreaterThan(reset.Timestamp, active.Timestamp, "The later value stays the later one.");
        Assert.AreEqual(TimeSpan.FromMilliseconds(1), active.Timestamp - reset.Timestamp);
    }

    [TestMethod]
    public void Repeat_GivesTheLastValueOfEveryTopicAgain_ButNoAlarmAndNoHeartbeat()
    {
        _translator.Connected();
        _translator.Heartbeat(1);
        Translate(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "17.11.2026-09:30:00");
        Translate(CuttingNotifications.MachineRunning, "1", "PROG_A", "17.11.2026-09:30:00");
        Translate(CuttingNotifications.CurrentAlarms, "1", "1", "Text", "");

        var repeated = _translator.Repeat();

        AssertText(repeated, Paths.ConnectionState, "Connected");
        AssertText(repeated, Paths.OperationMode, "None");
        AssertText(repeated, Paths.ChannelState, "Active");
        AssertText(repeated, Paths.ActiveProgram, "PROG_A");
        AssertText(repeated, Paths.ItemState, "Executing");
        Assert.IsFalse(repeated.Any(p => p is AlarmPublication or NumberPublication { Path: Paths.Heartbeat }));
        Assert.IsTrue(repeated.All(p => p.Timestamp >= Now.UtcDateTime), "A repeated value is observed now.");
    }

    [TestMethod]
    public void Connected_SaysConnectedAndThatTheOperationModeIsUnknown()
    {
        var result = _translator.Connected();

        AssertText(result, Paths.ConnectionState, "Connected");
        AssertText(result, Paths.OperationMode, "None");
    }

    [TestMethod]
    public void Disconnected_ByTheMachine_IsNotAvailable_BySilence_OnlyDisconnected()
    {
        var off = _translator.Disconnected(machineSwitchedOff: true);
        var silent = _translator.Disconnected(machineSwitchedOff: false);

        AssertText(off, Paths.ItemState, "NotAvailable");
        AssertText(off, Paths.ConnectionState, "Disconnected");
        Assert.HasCount(1, silent);
        AssertText(silent, Paths.ConnectionState, "Disconnected");
    }

    [TestMethod]
    public void AStopWithoutFault_WhileAProgramRuns_InterruptsTheChannel_AndRunningAgainResumesIt()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        var paused = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "2");
        var running = Translate(CuttingNotifications.MachineRunning, "1", "PROG", "");

        AssertText(paused, Paths.ItemState, "NotExecuting");
        AssertText(paused, Paths.ChannelState, "Interrupted");
        AssertText(running, Paths.ChannelState, "Active");
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("0")]
    [DataRow("3")]
    public void AStopReasonTheProtocolDoesNotKnow_IsIgnored(string reason)
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        Assert.IsEmpty(Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", reason));
    }

    [TestMethod]
    [DataRow("1", "OutOfService", CuttingNotifications.ResetNcp)]
    [DataRow("2", "NotExecuting", CuttingNotifications.EndNcp)]
    public void AStopJustBeforeTheEndOfTheProgram_IsNoHalt(string reason, string state, string end)
    {
        var held = Held();
        held.Translate(CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG", "", "", "1", "17.11.2026-09:00:00"));

        var stop = held.Translate(CuttingNotification.Create(CuttingNotifications.MachineStopped, "1", "PROG", "17.11.2026-09:30:00", reason));
        var ended = held.Translate(CuttingNotification.Create(end, "1", "PROG", "", "", "1", "17.11.2026-09:30:00"));

        Assert.IsEmpty(stop, "The stop waits for what follows.");
        AssertText(ended, Paths.ItemState, state);
        Assert.AreEqual(new DateTime(2026, 11, 17, 9, 30, 0, DateTimeKind.Utc), ended[0].Timestamp, "The state keeps its time.");
        Assert.IsFalse(ended.Any(p => p is TextPublication { Value: "Interrupted" }));
        AssertText(ended, Paths.ChannelState, "Reset");
    }

    [TestMethod]
    public void RunningJustBeforeTheStart_IsTheStart()
    {
        var held = Held();

        var running = held.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG", "17.11.2026-09:30:00"));
        var started = held.Translate(CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG", "", "", "1", "17.11.2026-09:30:00"));

        Assert.IsEmpty(running);
        AssertText(started, Paths.ItemState, "Executing");
        Assert.HasCount(1, started.OfType<TextPublication>().Where(p => p.Path == Paths.ChannelState));
        AssertText(started, Paths.ChannelState, "Active");
    }

    [TestMethod]
    public void AStopWithNothingAfter_IsAHalt_OnceItsTimeIsUp()
    {
        var clock = new FixedTime(Now);
        var held = Held(clock);
        held.Translate(CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG"));
        held.Translate(CuttingNotification.Create(CuttingNotifications.MachineStopped, "1", "PROG", "", "2"));

        var early = held.Due();
        clock.Advance(TimeSpan.FromSeconds(1));
        var due = held.Due();

        Assert.IsEmpty(early);
        AssertText(due, Paths.ItemState, "NotExecuting");
        AssertText(due, Paths.ChannelState, "Interrupted");
        Assert.IsNull(held.HeldUntil);
    }

    [TestMethod]
    public void AHeldStateThatIsDue_ComesWithTheRepetition()
    {
        var clock = new FixedTime(Now);
        var held = Held(clock);
        held.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG"));
        clock.Advance(TimeSpan.FromSeconds(5));

        var repeated = held.Repeat();

        Assert.IsTrue(repeated.Any(p => p is TextPublication { Path: Paths.ItemState, Value: "Executing" }));
    }

    [TestMethod]
    [DataRow(CuttingNotifications.PlanChanged)]
    [DataRow(CuttingNotifications.StartAllocation)]
    [DataRow(CuttingNotifications.PartUnloadFinished)]
    public void ANotificationTheDataModelHasNoPlaceFor_PublishesNothing(string name)
    {
        Assert.IsEmpty(Translate(name, "1"));
    }

    /// <summary>A translator that holds running and stopped states for one second, as the adapter does.</summary>
    private static CuttingTranslator Held(FixedTime? clock = null)
    {
        return new CuttingTranslator(TimeZoneInfo.Utc, clock ?? new FixedTime(Now), TimeSpan.FromSeconds(1));
    }

    private IReadOnlyList<Publication> Translate(string name, params string[] fields)
    {
        return _translator.Translate(CuttingNotification.Create(name, fields));
    }

    private static void AssertText(IReadOnlyList<Publication> publications, string path, string value)
    {
        var text = publications.OfType<TextPublication>().SingleOrDefault(p => p.Path == path);
        Assert.IsNotNull(text, $"Nothing published at {path}.");
        Assert.AreEqual(value, text.Value, path);
    }
}
