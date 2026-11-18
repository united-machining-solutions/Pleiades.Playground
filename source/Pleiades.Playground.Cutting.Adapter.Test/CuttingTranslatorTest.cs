using System.Text.Json.Nodes;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Cutting.Adapter.Test;

[TestClass]
public sealed class CuttingTranslatorTest
{
    internal static readonly MachineIdentity Identity = new("TRUMPF", "https://www.trumpf.com", "Laser2D", "L-01");

    private static readonly DateTimeOffset Now = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);

    private static readonly string Program = Identity.Signal(Paths.ActiveProgram);

    private readonly CuttingTranslator _translator = new(Identity, TimeZoneInfo.Utc, new FixedTime(Now));

    [TestMethod]
    public void TheProgram_IsASignalOfTheManufacturer()
    {
        Assert.AreEqual("x-trumpf-com.WorkMasterMonitoring.ActiveProgram", _translator.ProgramPath);
        Assert.AreEqual("machines/trumpf_Laser2D_L-01/oem/WorkMasterMonitoring/ActiveProgram",
            MachineBinding.Topic(Identity.MachineId, _translator.ProgramPath));
    }

    [TestMethod]
    public void StartNcp_TheChannelIsActiveAndTheProgramIsNamed()
    {
        var result = Translate(CuttingNotifications.StartNcp, "1", "PROG_A", "3", "ORDER", "1", "17.11.2026-09:30:00", "JOB", "0");

        AssertValue(result, Paths.ChannelState, "Active");
        AssertValue(result, Program, "PROG_A");
        AssertValue(result, Paths.ActiveWorkMaster, "PROG_A");
        Assert.AreEqual(new DateTimeOffset(2026, 11, 17, 9, 30, 0, TimeSpan.Zero), result[0].Timestamp);
    }

    [TestMethod]
    public void EndNcp_TheChannelIsResetAndNoProgramRuns()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG_A");

        var result = Translate(CuttingNotifications.EndNcp, "1", "PROG_A");

        AssertValue(result, Paths.ChannelState, "Reset");
        Assert.IsNull(Value(result, Program), "No program runs: null, as the simulators publish it.");
        Assert.IsNull(Value(result, Paths.ActiveWorkMaster));
    }

    [TestMethod]
    [DataRow(CuttingNotifications.MachineRunning, "", "Executing")]
    [DataRow(CuttingNotifications.MachineStopped, "2", "NotExecuting")]
    [DataRow(CuttingNotifications.MachineStopped, "1", "OutOfService")]
    public void RunningAndStopped_GiveTheSnapshotOfTheState(string name, string reason, string state)
    {
        var result = Translate(name, "1", "PROG", "17.11.2026-09:00:00", reason);

        AssertStatus(result, state);
    }

    [TestMethod]
    public void AFault_WhileAProgramRuns_InterruptsTheChannel_AndRunningAgainResumesItAndClearsTheAlert()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        var fault = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "1");
        var alarm = Translate(CuttingNotifications.CurrentAlarms, "1", "10001234", "Nozzle damaged", "17.11.2026-09:10:00");
        var again = Translate(CuttingNotifications.CurrentAlarms, "1", "10001234", "Nozzle damaged", "17.11.2026-09:10:00");
        var running = Translate(CuttingNotifications.MachineRunning, "1", "PROG", "");

        AssertValue(fault, Paths.ChannelState, "Interrupted");
        var raised = alarm.OfType<AlertPublication>().Single();
        Assert.AreEqual(Paths.AlertRaised, raised.Type);
        Assert.AreEqual("10001234", (string?)raised.Alert["ErrorCode"]);
        Assert.AreEqual("Nozzle damaged", (string?)raised.Alert["Message"]);
        Assert.AreEqual("Failure", (string?)raised.Alert["Severity"]);
        Assert.AreEqual("2026-11-17T09:10:00.000Z", (string?)raised.Alert["Time"]);
        var list = Value(alarm, Paths.ActiveAlerts)!.AsArray();
        Assert.HasCount(1, list);
        Assert.AreEqual((string?)raised.Alert["Id"], (string?)list[0]!["Id"]);
        Assert.IsEmpty(again, "An alarm the machine repeats is raised once.");

        var cleared = running.OfType<AlertPublication>().Single();
        Assert.AreEqual(Paths.AlertCleared, cleared.Type);
        Assert.AreEqual((string?)raised.Alert["Id"], (string?)cleared.Alert["Id"], "Raised and cleared name the same alert.");
        Assert.IsEmpty(Value(running, Paths.ActiveAlerts)!.AsArray());
        AssertValue(running, Paths.ChannelState, "Active");
        Assert.IsEmpty(_translator.ActiveAlarms);
    }

    [TestMethod]
    public void AnAlertId_IsAUuid()
    {
        var alarm = Translate(CuttingNotifications.CurrentAlarms, "1", "1", "Text", "").OfType<AlertPublication>().Single();

        Assert.IsTrue(Guid.TryParse((string?)alarm.Alert["Id"], out _));
    }

    [TestMethod]
    public void Feedrate_InPercent_BecomesAFractionOfOne()
    {
        var result = Translate(CuttingNotifications.Feedrate, "1", "85", "17.11.2026-09:00:00");

        var feed = (ValuePublication)result.Single();
        Assert.AreEqual(Paths.FeedOverride, feed.Path);
        Assert.AreEqual(0.85, feed.Value!.GetValue<double>(), 1e-9);
        Assert.AreEqual("one", feed.Unit);
    }

    [TestMethod]
    public void ATimestampOfTheMachine_IsReadInItsTimeZone()
    {
        var berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        var translator = new CuttingTranslator(Identity, berlin, new FixedTime(Now));

        var result = translator.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "P", "17.11.2026-09:00:00"));

        Assert.AreEqual(new DateTimeOffset(2026, 11, 17, 8, 0, 0, TimeSpan.Zero), result[^1].Timestamp);
    }

    [TestMethod]
    [DataRow("17.11.2026-12:00:00", DisplayName = "in the future")]
    [DataRow("", DisplayName = "missing")]
    [DataRow("yesterday", DisplayName = "unreadable")]
    public void ATimestampTheBindingDoesNotAllow_BecomesTheTimeOfReceipt(string timestamp)
    {
        var result = Translate(CuttingNotifications.MachineRunning, "1", "P", timestamp);

        Assert.AreEqual(Now, result[^1].Timestamp);
    }

    [TestMethod]
    public void TheEndOfOneProgramAndTheStartOfTheNextInOneSecond_KeepTheirOrder()
    {
        var end = Translate(CuttingNotifications.EndNcp, "1", "PROG_A", "", "", "1", "17.11.2026-09:30:00");
        var start = Translate(CuttingNotifications.StartNcp, "1", "PROG_B", "", "", "1", "17.11.2026-09:30:00");

        var reset = end.OfType<ValuePublication>().Single(p => p.Path == Paths.ChannelState);
        var active = start.OfType<ValuePublication>().Single(p => p.Path == Paths.ChannelState);
        Assert.IsGreaterThan(reset.Timestamp, active.Timestamp, "The later value stays the later one.");
        Assert.AreEqual(TimeSpan.FromMilliseconds(1), active.Timestamp - reset.Timestamp);
    }

    [TestMethod]
    public void Connected_BeforeTheMachineSaidItsState_TheStateAndTheAlertsAreNotKnown()
    {
        var result = _translator.Connected();

        Assert.IsNull(Value(result, Paths.Status));
        Assert.IsTrue(result.OfType<ValuePublication>().Any(p => p.Path == Paths.Status), "State.Status goes out as null.");
        Assert.IsNull(Value(result, Paths.ActiveAlerts), "A machine may stand with an alarm the adapter has not heard of.");
        Assert.IsTrue(result.OfType<ValuePublication>().Any(p => p.Path == Paths.ActiveAlerts), "ActiveAlerts goes out as null.");
    }

    [TestMethod]
    [DataRow(CuttingNotifications.MachineRunning, "")]
    [DataRow(CuttingNotifications.MachineStopped, "2")]
    public void RunningOrAStopWithoutFault_SaysThatNoAlertStands(string name, string reason)
    {
        _translator.Connected();

        var result = Translate(name, "1", "PROG", "", reason);

        Assert.IsEmpty(Value(result, Paths.ActiveAlerts)!.AsArray());
        Assert.IsEmpty(result.OfType<AlertPublication>(), "No alert was raised, so none is cleared.");
        Assert.IsEmpty(Translate(name, "1", "PROG", "", reason).OfType<ValuePublication>().Where(p => p.Path == Paths.ActiveAlerts),
            "Once known as empty, the list goes out again only when it changes.");
    }

    [TestMethod]
    public void AStopByAFault_LeavesTheAlertsNotKnown_UntilTheMachineNamesTheAlarm()
    {
        var fault = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "1");
        var alarm = Translate(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "");

        Assert.IsFalse(fault.OfType<ValuePublication>().Any(p => p.Path == Paths.ActiveAlerts));
        Assert.HasCount(1, Value(alarm, Paths.ActiveAlerts)!.AsArray());
        Assert.HasCount(1, Value(_translator.Connected(), Paths.ActiveAlerts)!.AsArray(), "Once heard, the list is known.");
    }

    [TestMethod]
    public void TheListOfAlerts_GoesOutBeforeTheEventsThatChangeIt()
    {
        var raised = Translate(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "");
        var cleared = Translate(CuttingNotifications.MachineRunning, "1", "PROG", "").ToList();

        Assert.IsInstanceOfType<ValuePublication>(raised[0]);
        Assert.IsInstanceOfType<AlertPublication>(raised[1]);
        var list = cleared.FindIndex(p => p is ValuePublication { Path: Paths.ActiveAlerts });
        var @event = cleared.FindIndex(p => p is AlertPublication);
        Assert.IsLessThan(@event, list);
    }

    [TestMethod]
    public void Connected_BeforeTheMachineSaidThem_TheChannelAndTheProgramAreNotKnown()
    {
        var result = _translator.Connected();

        Assert.IsNull(Value(result, Paths.ChannelState));
        Assert.IsNull(Value(result, Program));
        Assert.IsNull(Value(result, Paths.ActiveWorkMaster));
    }

    [TestMethod]
    public void Connected_AfterTheMachineSaidItsState_KeepsIt()
    {
        Translate(CuttingNotifications.MachineRunning, "1", "P", "");

        var result = _translator.Connected();

        Assert.IsFalse(result.OfType<ValuePublication>().Any(p => p.Path == Paths.Status), "The state the machine said stands.");
    }

    [TestMethod]
    public void Disconnected_ByTheMachine_IsNotAvailable_BySilence_NothingOfTheMachine()
    {
        var off = _translator.Disconnected(machineSwitchedOff: true);
        var silent = _translator.Disconnected(machineSwitchedOff: false);

        AssertStatus(off, "NotAvailable");
        Assert.IsEmpty(silent, "Only Connection.State says so: the adapter does not know the state of the machine.");
    }

    [TestMethod]
    public void AMachineThatSwitchesOff_WhileAProgramRuns_EndsTheProgram()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        var off = _translator.Disconnected(machineSwitchedOff: true);

        AssertValue(off, Paths.ChannelState, "Reset");
        Assert.IsNull(Value(off, Program));
        Assert.IsNull(Value(off, Paths.ActiveWorkMaster));
    }

    [TestMethod]
    public void AMachineThatFallsSilent_KeepsItsProgram_SoThatAHaltAfterIsStillAHalt()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        Assert.IsEmpty(_translator.Disconnected(machineSwitchedOff: false));
        var paused = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "2");

        AssertValue(paused, Paths.ChannelState, "Interrupted");
    }

    [TestMethod]
    public void AMachineThatRestarts_EndsItsProgramAndClearsItsAlerts()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");
        Translate(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "");

        var restarted = _translator.Restarted();

        AssertValue(restarted, Paths.ChannelState, "Reset");
        Assert.IsNull(Value(restarted, Program));
        Assert.IsNull(Value(restarted, Paths.ActiveWorkMaster));
        Assert.AreEqual(Paths.AlertCleared, restarted.OfType<AlertPublication>().Single().Type);
        Assert.IsEmpty(_translator.ActiveAlarms);
    }

    [TestMethod]
    public void AMachineThatSwitchesOff_ClearsItsAlerts()
    {
        Translate(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "");

        var off = _translator.Disconnected(machineSwitchedOff: true);

        Assert.AreEqual(Paths.AlertCleared, off.OfType<AlertPublication>().Single().Type);
        Assert.IsEmpty(Value(off, Paths.ActiveAlerts)!.AsArray());
        Assert.IsEmpty(_translator.ActiveAlarms);
    }

    [TestMethod]
    public void AStopWithoutFault_WhileAProgramRuns_InterruptsTheChannel_AndRunningAgainResumesIt()
    {
        Translate(CuttingNotifications.StartNcp, "1", "PROG");

        var paused = Translate(CuttingNotifications.MachineStopped, "1", "PROG", "", "2");
        var running = Translate(CuttingNotifications.MachineRunning, "1", "PROG", "");

        AssertStatus(paused, "NotExecuting");
        AssertValue(paused, Paths.ChannelState, "Interrupted");
        AssertValue(running, Paths.ChannelState, "Active");
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
        AssertStatus(ended, state);
        Assert.AreEqual(new DateTimeOffset(2026, 11, 17, 9, 30, 0, TimeSpan.Zero), ended[0].Timestamp, "The state keeps its time.");
        Assert.IsFalse(ended.OfType<ValuePublication>().Any(p => p.Path == Paths.ChannelState && (string?)p.Value == "Interrupted"));
        AssertValue(ended, Paths.ChannelState, "Reset");
    }

    [TestMethod]
    public void RunningJustBeforeTheStart_IsTheStart()
    {
        var held = Held();

        var running = held.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG", "17.11.2026-09:30:00"));
        var started = held.Translate(CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG", "", "", "1", "17.11.2026-09:30:00"));

        Assert.IsEmpty(running);
        AssertStatus(started, "Executing");
        Assert.HasCount(1, started.OfType<ValuePublication>().Where(p => p.Path == Paths.ChannelState));
        AssertValue(started, Paths.ChannelState, "Active");
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
        AssertStatus(due, "NotExecuting");
        AssertValue(due, Paths.ChannelState, "Interrupted");
        Assert.IsNull(held.HeldUntil);
    }

    [TestMethod]
    public void AHeldState_GoesFirst_WhenTheMachineIsGone()
    {
        var held = Held();
        held.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG"));

        var gone = held.Disconnected(machineSwitchedOff: false);

        AssertStatus(gone, "Executing");
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
        return new CuttingTranslator(Identity, TimeZoneInfo.Utc, clock ?? new FixedTime(Now), TimeSpan.FromSeconds(1));
    }

    private IReadOnlyList<Publication> Translate(string name, params string[] fields)
    {
        return _translator.Translate(CuttingNotification.Create(name, fields));
    }

    private static JsonNode? Value(IReadOnlyList<Publication> publications, string path)
    {
        var value = publications.OfType<ValuePublication>().LastOrDefault(p => p.Path == path);
        Assert.IsNotNull(value, $"Nothing published at {path}.");
        return value.Value;
    }

    private static void AssertValue(IReadOnlyList<Publication> publications, string path, string expected)
    {
        Assert.AreEqual(expected, (string?)Value(publications, path), path);
    }

    private static void AssertStatus(IReadOnlyList<Publication> publications, string itemState)
    {
        var status = Value(publications, Paths.Status)!.AsObject();
        Assert.AreEqual(itemState, (string?)status["MachineryItemState"]);
        Assert.AreEqual("None", (string?)status["MachineryOperationMode"], "The protocol knows no operation mode.");
    }
}
