using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class TopicsTest
{
    [TestMethod]
    [DataRow("State.MachineryItemState", "machines/P-04/umati/State/MachineryItemState")]
    [DataRow("Channel[1].ChannelState", "machines/P-04/umati/Channel/1/ChannelState")]
    [DataRow("Consumption.Electricity[Main].AcActivePowerTotal", "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal")]
    public void A_path_becomes_one_topic_level_per_dot_and_instance_key(string path, string expected)
    {
        Assert.AreEqual(expected, Topics.Value("P-04", "umati", path));
    }

    [TestMethod]
    [DataRow("P-04", true)]
    [DataRow("A0280O0001", true)]
    [DataRow("a/b", false)]
    [DataRow("a+b", false)]
    [DataRow("a#", false)]
    [DataRow("a b", false)]
    [DataRow("", false)]
    public void A_serial_number_is_one_topic_level(string value, bool expected)
    {
        Assert.AreEqual(expected, Topics.IsSerialNumber(value));
    }

    [TestMethod]
    [DataRow("State.Status", true)]
    [DataRow("Channel[1].ChannelState", true)]
    [DataRow("State", false)]
    [DataRow("State/Status", false)]
    [DataRow("State.Sta tus", false)]
    [DataRow("Channel[+].ChannelState", false)]
    public void A_path_has_a_group_and_an_element(string value, bool expected)
    {
        Assert.AreEqual(expected, Topics.IsPath(value));
    }
}

[TestClass]
public class ValueConverterTest
{
    [TestMethod]
    public void Percent_becomes_a_fraction()
    {
        var element = new ElementRegistration { Kind = ValueKind.Number, Unit = "one", Scale = 0.01 };

        Assert.AreEqual(1.0, ValueConverter.Convert(element, 100.0)!.Number);
        Assert.AreEqual(0.8, ValueConverter.Convert(element, (ushort)80)!.Number);
    }

    [TestMethod]
    public void Scaling_leaves_no_binary_noise()
    {
        var kilowatt = new ElementRegistration { Kind = ValueKind.Number, Unit = "watt", Scale = 1000 };

        Assert.AreEqual(32440.0, ValueConverter.Convert(kilowatt, 32.44)!.Number);
    }

    [TestMethod]
    public void Hours_become_seconds()
    {
        var element = new ElementRegistration { Kind = ValueKind.Number, Unit = "second", Scale = 3600 };

        Assert.AreEqual(7200.0, ValueConverter.Convert(element, 2.0)!.Number);
    }

    [TestMethod]
    public void A_number_that_is_none_is_not_published()
    {
        var element = new ElementRegistration { Kind = ValueKind.Number, Unit = "one" };

        Assert.IsNull(ValueConverter.Convert(element, "running"));
        Assert.IsNull(ValueConverter.Convert(element, double.NaN));
        Assert.IsNull(ValueConverter.Convert(element, null));
    }

    [TestMethod]
    public void An_enumeration_is_published_by_its_name()
    {
        var element = new ElementRegistration
        {
            Kind = ValueKind.Text,
            Map = new Dictionary<string, string> { ["0"] = "Active", ["1"] = "Interrupted", ["2"] = "Reset" },
        };

        Assert.AreEqual("Interrupted", ValueConverter.Convert(element, 1)!.Text);
        Assert.IsNull(ValueConverter.Convert(element, 7), "A value the map does not name is not published.");
    }

    [TestMethod]
    public void A_derived_state_falls_back_to_its_default()
    {
        var element = new ElementRegistration
        {
            Kind = ValueKind.Text,
            Map = new Dictionary<string, string> { ["1"] = "Executing" },
            MapDefault = "NotExecuting",
        };

        Assert.AreEqual("Executing", ValueConverter.Convert(element, (uint)1)!.Text);
        Assert.AreEqual("NotExecuting", ValueConverter.Convert(element, (uint)3)!.Text);
    }

    [TestMethod]
    public void A_boolean_can_be_a_state()
    {
        var element = new ElementRegistration
        {
            Kind = ValueKind.Text,
            Map = new Dictionary<string, string> { ["true"] = "Executing", ["false"] = "NotExecuting" },
        };

        Assert.AreEqual("Executing", ValueConverter.Convert(element, true)!.Text);
    }

    [TestMethod]
    public void A_text_is_published_as_it_is_and_an_empty_one_not_at_all()
    {
        var element = new ElementRegistration { Kind = ValueKind.Text };

        Assert.AreEqual("J3188_4", ValueConverter.Convert(element, "J3188_4")!.Text);
        Assert.IsNull(ValueConverter.Convert(element, string.Empty));
    }

    [TestMethod]
    public void A_flag_is_a_boolean_only()
    {
        var element = new ElementRegistration { Kind = ValueKind.Boolean };

        Assert.IsTrue(ValueConverter.Convert(element, true)!.Flag);
        Assert.IsNull(ValueConverter.Convert(element, 1));
    }

    [TestMethod]
    public void A_unit_is_one_of_the_binding()
    {
        Assert.IsTrue(ValueConverter.TryParseUnit("joule", out var unit));
        Assert.AreEqual(BaseUnit.Joule, unit);
        Assert.IsFalse(ValueConverter.TryParseUnit("wattHour", out _));
        Assert.IsFalse(ValueConverter.TryParseUnit(null, out _));
    }
}

[TestClass]
public class AlertTrackerTest
{
    private static readonly DateTime Start = new(2026, 11, 16, 9, 0, 0, DateTimeKind.Utc);

    [TestMethod]
    [DataRow(1000, EventLevel.Error)]
    [DataRow(667, EventLevel.Error)]
    [DataRow(666, EventLevel.Warning)]
    [DataRow(334, EventLevel.Warning)]
    [DataRow(333, EventLevel.Information)]
    [DataRow(1, EventLevel.Information)]
    public void The_severity_gives_the_level(int severity, EventLevel expected)
    {
        Assert.AreEqual(expected, AlertTracker.LevelOf(severity));
    }

    [TestMethod]
    public void An_alarm_is_raised_once_and_reset_once_with_the_same_correlation()
    {
        var tracker = new AlertTracker();

        var raised = tracker.Observe("c1", active: true, "4711", "Coolant low", 400, Start);
        var again = tracker.Observe("c1", active: true, "4711", "Coolant low", 400, Start.AddSeconds(5));
        var reset = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddSeconds(9));
        var resetAgain = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddSeconds(10));

        Assert.AreEqual(NotificationAction.Raised, raised!.Action);
        Assert.AreEqual(EventLevel.Warning, raised.Alert.Level);
        Assert.IsNull(again, "An alarm that stands is not raised a second time.");
        Assert.AreEqual(NotificationAction.Reset, reset!.Action);
        Assert.AreEqual(raised.Alert.CorrelationId, reset.Alert.CorrelationId);
        Assert.IsNull(resetAgain);
        Assert.IsEmpty(tracker.Open);
    }

    [TestMethod]
    public void After_a_reconnect_what_the_server_no_longer_lists_is_reset()
    {
        var tracker = new AlertTracker();
        tracker.Observe("stays", active: true, "1", "Stays", 800, Start);
        tracker.Observe("gone", active: true, "2", "Gone while nobody listened", 400, Start);

        tracker.BeginRefresh();
        var still = tracker.Observe("stays", active: true, "1", "Stays", 800, Start);
        var fresh = tracker.Observe("new", active: true, "3", "Raised while nobody listened", 400, Start.AddMinutes(1));
        var caughtUp = tracker.EndRefresh(Start.AddMinutes(2));

        Assert.IsNull(still);
        Assert.AreEqual(NotificationAction.Raised, fresh!.Action);
        Assert.HasCount(1, caughtUp);
        Assert.AreEqual("gone", caughtUp[0].Alert.ConditionId);
        Assert.AreEqual(NotificationAction.Reset, caughtUp[0].Action);
        CollectionAssert.AreEquivalent(new[] { "stays", "new" }, tracker.Open.Select(alert => alert.ConditionId).ToArray());
    }

    [TestMethod]
    public void The_alarms_of_the_last_run_are_known_at_the_start()
    {
        var before = new OpenAlert("c1", "aaaaaaaaaaaaaaaaaaaaaaaa", "4711", "Coolant low", EventLevel.Warning, Start);
        var tracker = new AlertTracker([before]);

        var reset = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddHours(1));

        Assert.AreEqual("aaaaaaaaaaaaaaaaaaaaaaaa", reset!.Alert.CorrelationId);
    }

    [TestMethod]
    public void An_identifier_has_the_form_the_events_api_stores()
    {
        var id = AlertTracker.NewId();

        Assert.AreEqual(24, id.Length);
        Assert.IsTrue(id.All(Uri.IsHexDigit));
    }
}
