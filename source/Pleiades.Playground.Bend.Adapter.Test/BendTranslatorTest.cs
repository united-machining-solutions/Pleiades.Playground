using System.Text.Json.Nodes;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Bend.Adapter.Test;

[TestClass]
public sealed class BendTranslatorTest
{
    internal static readonly MachineIdentity Identity = new("TRUMPF", "https://www.trumpf.com", "Bend5130", "B-01");

    private static readonly DateTime Fallback = new(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);

    // As the bending simulator writes it, with an XML declaration.
    private const string PartFeedback = """
        <?xml version="1.0" encoding="utf-8"?>
        <RCIInterface Version="3.2">
          <ManufacturingOrderFeedback>
            <Timestamp>2026.11.17 10:17:00</Timestamp>
            <ReportedBy>Operator</ReportedBy>
            <ManufacturingOrder OrderNo="FA-100" Name="PP-1">
              <PositionNo>1</PositionNo>
              <PartNo>BRACKET-12</PartNo>
              <ProgramName>BRACKET_12.bend</ProgramName>
              <DesiredNumberOfParts>3</DesiredNumberOfParts>
              <ProcessedParts>3</ProcessedParts>
              <Status>7</Status>
              <ScrapParts>0</ScrapParts>
            </ManufacturingOrder>
          </ManufacturingOrderFeedback>
        </RCIInterface>
        """;

    private static RciTelegramParser Parser() => new(TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin"));

    internal static BendTranslator Translator(DateTimeOffset? now = null)
    {
        var next = 0;
        return new BendTranslator(Identity, new FixedTime(now ?? Fallback.AddHours(1)), () => $"id-{++next}");
    }

    internal static JsonNode? ValueAt(IEnumerable<Publication> publications, string path) =>
        publications.OfType<ValuePublication>().Last(p => p.Path == path).Value;

    private static string? ItemState(IEnumerable<Publication> publications) =>
        (string?)ValueAt(publications, Paths.Status)!["MachineryItemState"];

    [TestMethod]
    [DataRow(1, "Executing", "Processing", false)]
    [DataRow(0, "NotExecuting", "Processing", false)]
    [DataRow(2, "OutOfService", "Maintenance", false)]
    [DataRow(-1, "OutOfService", "Processing", false)]
    [DataRow(3, "NotAvailable", "None", true)]
    public void The_operating_state_becomes_the_snapshot_State_Status(int state, string itemState, string operationMode, bool offline)
    {
        var translator = Translator();
        var publications = translator.Translate(new OperatingStateObserved(Fallback, state, string.Empty, string.Empty));

        var status = ValueAt(publications, Paths.Status)!;
        Assert.AreEqual(itemState, (string?)status["MachineryItemState"]);
        Assert.AreEqual(operationMode, (string?)status["MachineryOperationMode"]);
        Assert.AreEqual(state, (int?)ValueAt(publications, "x-trumpf-com.Rci.OperatingState"));
        Assert.AreEqual(offline, translator.Offline);
    }

    [TestMethod]
    public void A_fault_is_raised_once_and_cleared_with_the_same_alert()
    {
        var translator = Translator();
        var fault = new OperatingStateObserved(Fallback, -1, "4711", "Light curtain interrupted");

        var first = translator.Translate(fault);
        var again = translator.Translate(fault with { Timestamp = Fallback.AddSeconds(5) });
        var cleared = translator.Translate(new OperatingStateObserved(Fallback.AddSeconds(10), 0, string.Empty, string.Empty));

        var raised = first.OfType<EventPublication>().Single();
        Assert.AreEqual(Paths.AlertRaised, raised.Type);
        Assert.AreEqual("RCI-4711", (string?)raised.Data["ErrorCode"]);
        Assert.AreEqual("Light curtain interrupted", (string?)raised.Data["Message"]);
        Assert.AreEqual(BendTranslator.FaultSeverity, (string?)raised.Data["Severity"]);
        Assert.HasCount(1, ValueAt(first, Paths.ActiveAlerts)!.AsArray());

        Assert.IsFalse(again.OfType<EventPublication>().Any(), "A fault the machine repeats is raised once.");

        var end = cleared.OfType<EventPublication>().Single();
        Assert.AreEqual(Paths.AlertCleared, end.Type);
        Assert.AreEqual((string?)raised.Data["Id"], (string?)end.Data["Id"]);
        Assert.IsEmpty(ValueAt(cleared, Paths.ActiveAlerts)!.AsArray());
        Assert.IsNull(translator.ActiveFault);
    }

    [TestMethod]
    public void Another_fault_clears_the_one_before()
    {
        var translator = Translator();
        translator.Translate(new OperatingStateObserved(Fallback, -1, "1", "First"));

        var events = translator.Translate(new OperatingStateObserved(Fallback.AddSeconds(1), -1, "2", "Second")).OfType<EventPublication>().ToList();

        CollectionAssert.AreEqual(new[] { Paths.AlertCleared, Paths.AlertRaised }, events.Select(e => e.Type).ToArray());
        Assert.AreEqual("RCI-2", (string?)translator.ActiveFault!["ErrorCode"]);
    }

    [TestMethod]
    public void An_order_gives_the_program_and_the_part_counts_as_signals_of_the_manufacturer()
    {
        var order = (OrderObserved)Parser().Parse(PartFeedback, Fallback).Single();

        var publications = Translator().Translate(order);

        Assert.AreEqual("BRACKET_12.bend", (string?)ValueAt(publications, Paths.ActiveWorkMaster), "The work master of a machine without work masters is its program.");
        Assert.AreEqual("BRACKET_12.bend", (string?)ValueAt(publications, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"));
        Assert.AreEqual("FA-100", (string?)ValueAt(publications, "x-trumpf-com.Production.ActiveOrderNo"));
        Assert.AreEqual(3, (int?)ValueAt(publications, "x-trumpf-com.Production.ProcessedParts"));
        Assert.AreEqual(3, (int?)ValueAt(publications, "x-trumpf-com.Production.DesiredParts"));
        Assert.IsTrue(publications.OfType<ValuePublication>().Where(p => p.Value is JsonValue v && v.TryGetValue<int>(out _))
            .All(p => p.Unit == "one"), "Every count has the unit one.");
        var finished = publications.OfType<EventPublication>().Single();
        Assert.AreEqual(Paths.NotificationEvent, finished.Type);
        Assert.AreEqual("RCI-ORDER-FINISHED", (string?)finished.Data["ErrorCode"]);
        Assert.IsNull(finished.Data["Severity"], "A notification is an alert without severity.");
    }

    [TestMethod]
    public void The_start_of_the_processing_shows_the_program()
    {
        var feedback = (OrderObserved)Parser().Parse(PartFeedback, Fallback).Single();
        var started = feedback with { Event = OrderEvent.Started, ProcessedParts = 0 };

        var publications = Translator().Translate(started);

        Assert.AreEqual("BRACKET_12.bend", (string?)ValueAt(publications, Paths.ActiveWorkMaster));
        Assert.AreEqual("BRACKET_12.bend", (string?)ValueAt(publications, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"));
    }

    [TestMethod]
    public void The_end_of_the_processing_ends_the_program()
    {
        var translator = Translator();
        var feedback = (OrderObserved)Parser().Parse(PartFeedback, Fallback).Single();
        translator.Translate(feedback);
        var stopped = feedback with { Timestamp = Fallback.AddSeconds(1), Event = OrderEvent.Stopped };

        var publications = translator.Translate(stopped);

        Assert.IsNull(ValueAt(publications, Paths.ActiveWorkMaster));
        Assert.IsNull(ValueAt(publications, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"));
        Assert.AreEqual("FA-100", (string?)ValueAt(publications, "x-trumpf-com.Production.ActiveOrderNo"), "The order and its counts stay.");
        Assert.AreEqual(3, (int?)ValueAt(publications, "x-trumpf-com.Production.ProcessedParts"));
    }

    [TestMethod]
    public void An_operator_message_is_a_notification_event()
    {
        var publications = Translator().Translate(new OperatorMessageObserved(Fallback, "12", "Change the tool"));

        var message = publications.OfType<EventPublication>().Single();
        Assert.AreEqual(Paths.NotificationEvent, message.Type);
        Assert.AreEqual("RCI-MESSAGE-12", (string?)message.Data["ErrorCode"]);
        Assert.AreEqual("Change the tool", (string?)message.Data["Message"]);
    }

    [TestMethod]
    public void Offline_ends_the_program_and_clears_the_fault()
    {
        var translator = Translator();
        translator.Translate(new OperatingStateObserved(Fallback, -1, "4711", "Fault"));

        var publications = translator.Translate(new OperatingStateObserved(Fallback.AddSeconds(1), 3, string.Empty, string.Empty));

        Assert.IsTrue(publications.OfType<EventPublication>().Any(e => e.Type == Paths.AlertCleared));
        Assert.IsNull(ValueAt(publications, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"));
        Assert.IsNull(ValueAt(publications, Paths.ActiveWorkMaster));
        Assert.AreEqual("NotAvailable", ItemState(publications));
    }

    [TestMethod]
    public void Any_other_message_after_offline_shows_the_machine_is_reached_again()
    {
        var translator = Translator();
        translator.Translate(new OperatingStateObserved(Fallback, 3, string.Empty, string.Empty));
        var order = (OrderObserved)Parser().Parse(PartFeedback, Fallback).Single();

        translator.Translate(order with { Timestamp = Fallback.AddSeconds(1) });

        Assert.IsFalse(translator.Offline, "an order feedback comes from a machine that is reached");
    }

    [TestMethod]
    public void What_the_machine_has_not_said_yet_is_null_the_alerts_included()
    {
        var publications = Translator().Current();

        Assert.IsNull(ValueAt(publications, Paths.Status));
        Assert.IsNull(ValueAt(publications, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"));
        Assert.IsNull(ValueAt(publications, Paths.ActiveAlerts));
    }

    [TestMethod]
    public void The_first_operating_state_makes_the_alerts_known()
    {
        var translator = Translator();

        var first = translator.Translate(new OperatingStateObserved(Fallback, 0, string.Empty, string.Empty));
        var second = translator.Translate(new OperatingStateObserved(Fallback.AddSeconds(1), 1, string.Empty, string.Empty));

        Assert.IsEmpty(ValueAt(first, Paths.ActiveAlerts)!.AsArray());
        Assert.IsFalse(second.OfType<ValuePublication>().Any(p => p.Path == Paths.ActiveAlerts), "A list known to be empty is not sent again.");
        Assert.IsEmpty(ValueAt(translator.Current(), Paths.ActiveAlerts)!.AsArray());
    }

    [TestMethod]
    public void Without_events_only_values_come_and_the_fault_still_stands()
    {
        var translator = Translator();

        var publications = translator.Translate(new OperatingStateObserved(Fallback, -1, "1", "Fault"), withEvents: false);

        Assert.IsTrue(publications.All(p => p is not EventPublication));
        Assert.IsNotNull(translator.ActiveFault);
    }

    [TestMethod]
    public void Values_of_one_path_in_the_same_second_keep_their_order()
    {
        var translator = Translator();

        var first = translator.Translate(new OperatingStateObserved(Fallback, 1, string.Empty, string.Empty));
        var second = translator.Translate(new OperatingStateObserved(Fallback, 0, string.Empty, string.Empty));

        var a = first.OfType<ValuePublication>().Single(p => p.Path == Paths.Status).Timestamp;
        var b = second.OfType<ValuePublication>().Single(p => p.Path == Paths.Status).Timestamp;
        Assert.IsGreaterThan(a, b);
    }

    [TestMethod]
    public void A_timestamp_in_the_future_becomes_now()
    {
        var now = new DateTimeOffset(Fallback);
        var publications = Translator(now).Translate(new OperatingStateObserved(Fallback.AddHours(2), 1, string.Empty, string.Empty));

        Assert.AreEqual(now, publications.OfType<ValuePublication>().First().Timestamp);
    }
}
