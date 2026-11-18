using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class TopicsTest
{
    [TestMethod]
    [DataRow("umati", "Channel[1].ChannelState", "Channel.1.ChannelState")]
    [DataRow("umati", "Consumption.Electricity[Main].AcActivePowerTotal", "Consumption.Electricity.Main.AcActivePowerTotal")]
    [DataRow("umati", "OperationCounters.PowerOnDuration", "OperationCounters.PowerOnDuration")]
    [DataRow("umati", "State.MachineryItemState", "State.Status")]
    [DataRow("umati", "State.MachineryOperationMode", "State.Status")]
    [DataRow("umati", "Production.ActiveProgram", "WorkMasterMonitoring.ActiveWorkMaster")]
    [DataRow("umati", "Identification.SoftwareRevision", "x-trumpf-com.Identification.SoftwareRevision")]
    [DataRow("oem", "Laser[1].Power", "x-trumpf-com.Laser.1.Power")]
    [DataRow("vendor", "Laser[1].Power", "x-trumpf-com.Laser.1.Power")]
    public void A_path_of_a_registration_becomes_the_path_of_the_binding(string area, string path, string expected)
    {
        Assert.AreEqual(expected, Topics.BindingPath(area, path, "x-trumpf-com"));
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
    public void Kilowatt_hours_become_watt_hours()
    {
        var element = new ElementRegistration { Kind = ValueKind.Number, Unit = "wattHour", Scale = 1000 };

        Assert.AreEqual(1850500.0, ValueConverter.Convert(element, 1850.5)!.Number);
    }
}

[TestClass]
public class CatalogueUnitsTest
{
    [TestMethod]
    [DataRow("Consumption.Electricity[Main].AcActiveEnergyTotalImportHp", "wattHour")]
    [DataRow("Consumption.Electricity[Main].AcActivePowerTotal", "watt")]
    [DataRow("Channel[1].FeedOverride", "one")]
    [DataRow("Spindle[S1].Override", "one")]
    [DataRow("OperationCounters.PartsProducedInLifetime", "piece")]
    [DataRow("OperationCounters.PowerOnDuration", "second")]
    public void An_element_of_the_model_has_the_unit_of_its_catalogue(string path, string expected)
    {
        Assert.AreEqual(expected, CatalogueUnits.Of(path));
    }

    [TestMethod]
    public void A_year_has_no_unit_and_joule_is_not_a_unit_of_a_machine()
    {
        Assert.IsNull(CatalogueUnits.Of("Identification.YearOfConstruction"));
        Assert.Contains("Identification.YearOfConstruction", CatalogueUnits.WithoutUnit);
        Assert.IsTrue(CatalogueUnits.IsKnown("wattHour"));
        Assert.IsFalse(CatalogueUnits.IsKnown("joule"), "A machine carries energy in wattHour, as the catalogue does.");
        Assert.IsFalse(CatalogueUnits.IsKnown(null));
    }
}

[TestClass]
public class AlertTrackerTest
{
    private static readonly DateTime Start = new(2026, 11, 16, 9, 0, 0, DateTimeKind.Utc);

    [TestMethod]
    [DataRow(1000, "Failure")]
    [DataRow(667, "Failure")]
    [DataRow(666, "OffSpec")]
    [DataRow(334, "OffSpec")]
    [DataRow(333, "MaintenanceRequired")]
    [DataRow(1, "MaintenanceRequired")]
    public void The_severity_gives_the_category_of_NE_107(int severity, string expected)
    {
        Assert.AreEqual(expected, AlertTracker.CategoryOf(severity));
    }

    [TestMethod]
    public void An_alarm_is_raised_once_and_cleared_once_with_the_same_id()
    {
        var tracker = new AlertTracker();

        var raised = tracker.Observe("c1", active: true, "4711", "Coolant low", 400, Start);
        var again = tracker.Observe("c1", active: true, "4711", "Coolant low", 400, Start.AddSeconds(5));
        var reset = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddSeconds(9));
        var resetAgain = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddSeconds(10));

        Assert.AreEqual(AlertAction.Raised, raised!.Action);
        Assert.AreEqual("OffSpec", raised.Alert.Severity);
        Assert.IsNull(again, "An alarm that stands is not raised a second time.");
        Assert.AreEqual(AlertAction.Cleared, reset!.Action);
        Assert.AreEqual(raised.Alert.Id, reset.Alert.Id);
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
        Assert.AreEqual(AlertAction.Raised, fresh!.Action);
        Assert.HasCount(1, caughtUp);
        Assert.AreEqual("gone", caughtUp[0].Alert.ConditionId);
        Assert.AreEqual(AlertAction.Cleared, caughtUp[0].Action);
        CollectionAssert.AreEquivalent(new[] { "stays", "new" }, tracker.Open.Select(alert => alert.ConditionId).ToArray());
    }

    [TestMethod]
    public void The_alarms_of_the_last_run_are_known_at_the_start()
    {
        var before = new OpenAlert("c1", "6f1c1d3e-8f5a-4b5e-9d55-0c1b8a7e2f10", "4711", "Coolant low", 400, Start);
        var tracker = new AlertTracker([before]);

        var reset = tracker.Observe("c1", active: false, "4711", "Coolant low", 400, Start.AddHours(1));

        Assert.AreEqual("6f1c1d3e-8f5a-4b5e-9d55-0c1b8a7e2f10", reset!.Alert.Id);
    }

    [TestMethod]
    public void An_alarm_of_the_last_run_that_still_stands_is_raised_again_once_in_this_run()
    {
        var restart = Start.AddHours(2);
        var stands = new OpenAlert("stands", "6f1c1d3e-8f5a-4b5e-9d55-0c1b8a7e2f10", "4711", "Coolant low", 400, Start);
        var gone = new OpenAlert("gone", "0b7d2c4e-1a3f-4e5b-8c6d-7e8f9a0b1c2d", "4712", "Door open", 800, Start);
        var tracker = new AlertTracker([stands, gone], () => restart);

        tracker.BeginRefresh();
        var raisedAgain = tracker.Observe("stands", active: true, "4711", "Coolant low", 400, Start);
        var cleared = tracker.EndRefresh(restart);
        var thenAgain = tracker.Observe("stands", active: true, "4711", "Coolant low", 400, Start);

        Assert.AreEqual(AlertAction.Raised, raisedAgain!.Action, "This run names the alarm, so a consumer does not end it with the last run.");
        Assert.AreEqual(stands.Id, raisedAgain.Alert.Id, "The same occurrence keeps its id.");
        Assert.AreEqual(Start, raisedAgain.Alert.Since, "It came up when it came up: Time stays.");
        Assert.AreEqual(restart, raisedAgain.At, "The event is of this run, not before its start.");
        Assert.HasCount(1, cleared);
        Assert.AreEqual(gone.Id, cleared[0].Alert.Id, "What went while the adapter was down is cleared.");
        Assert.IsNull(thenAgain, "Raised again once, not with every refresh.");
        CollectionAssert.AreEqual(new[] { "stands" }, tracker.Open.Select(alert => alert.ConditionId).ToArray());
    }

    [TestMethod]
    public void An_alert_has_the_fields_of_the_model()
    {
        var alert = new OpenAlert("c1", "6f1c1d3e-8f5a-4b5e-9d55-0c1b8a7e2f10", "4711", "Coolant low", 400, Start, "Coolant");

        var json = alert.ToJson();

        Assert.AreEqual("6f1c1d3e-8f5a-4b5e-9d55-0c1b8a7e2f10", (string?)json["Id"]);
        Assert.AreEqual("4711", (string?)json["ErrorCode"]);
        Assert.AreEqual("Coolant low", (string?)json["Message"]);
        Assert.AreEqual("OffSpec", (string?)json["Severity"]);
        Assert.AreEqual(400, (int?)json["SeverityValue"]);
        Assert.AreEqual("2026-11-16T09:00:00.000Z", (string?)json["Time"]);
        Assert.AreEqual("Coolant", (string?)json["SourceName"]);
    }

    [TestMethod]
    public void An_id_is_a_uuid()
    {
        Assert.IsTrue(Guid.TryParse(AlertTracker.NewId(), out _));
    }
}
