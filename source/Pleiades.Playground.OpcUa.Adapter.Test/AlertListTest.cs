using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// The alerts of <c>Notification.ActiveAlerts</c> of <c>urn:umati2:datamodel:opcua</c>, and the alarm events of a
/// TRUMPF machine outside that namespace.
/// </summary>
[TestClass]
public class AlertListTest
{
    /// <summary>An alert of L26 as the TRUMPF OPC UA simulator gave it on 2026-11-18: severity MaintenanceRequired, 400.</summary>
    private const string GasMixOxygen =
        "PwAAAG5zdT1odHRwOi8vdHJ1bXBmLmNvbS9UUlVNUEYtSW50ZXJmYWNlcy87cz0xNzkuQmFzZVBsYy41LjExLjUuNBAAAABCYXNlUGxjLjUuMTEuNS40VAAAAEdhc01peCBPeHlnZW4gKE8yKSBwcmVzc3VyZSBzZW5zb3I6IFRoZSB2YWx1ZSBoYXMgZmFsbGVuIGJlbG93IHRoZSByZXF1aXJlZCBwcmVzc3VyZQQAAACQARt9Zk1wd90BBwAAAEJhc2VQbGMAAAAA";

    /// <summary>The second alert of L26 at the same time.</summary>
    private const string GasMixDifferential =
        "PwAAAG5zdT1odHRwOi8vdHJ1bXBmLmNvbS9UUlVNUEYtSW50ZXJmYWNlcy87cz0xNzkuQmFzZVBsYy41LjExLjUuNRAAAABCYXNlUGxjLjUuMTEuNS41QAAAAEdhc01peDogVGhlIHJlcXVpcmVkIGRpZmZlcmVudGlhbCBwcmVzc3VyZSBoYXMgbm90IGJlZW4gcmVhY2hlZC4EAAAAkAEag2ZNcHfdAQcAAABCYXNlUGxjAAAAAA==";

    /// <summary>An alert of K09: severity Failure, 800.</summary>
    private const string FeedHold =
        "RAAAAG5zdT1odHRwOi8vdHJ1bXBmLmNvbS9UUlVNUEYtSW50ZXJmYWNlcy87cz0xNzkuQmFzZVBsYy4wLjgyLjgyMTA0NTExFQAAAEJhc2VQbGMuMC44Mi44MjEwNDUxMRQAAABWT1JTQ0hVQiBIQUxULVRhc3RlcgEAAAAgA3AbcT5zd90BBwAAAEJhc2VQbGMAAAAA";

    private const string Umati2 = "urn:umati2:datamodel:opcua";

    private static readonly DateTime Now = new(2026, 11, 18, 16, 0, 0, DateTimeKind.Utc);

    private static ListedAlert Decode(string base64) => KnownStructures.DecodeAlert(Convert.FromBase64String(base64))!;

    private static ListedAlert Listed(string id, DateTime? time = null) => new(id, "E" + id, "Message " + id, "OffSpec", 500, time ?? Now.AddMinutes(-5), "Plc");

    [TestMethod]
    public void An_alert_of_the_simulator_is_decoded_member_by_member()
    {
        var alert = Decode(GasMixOxygen);

        Assert.AreEqual("nsu=http://trumpf.com/TRUMPF-Interfaces/;s=179.BasePlc.5.11.5.4", alert.Id);
        Assert.AreEqual("BasePlc.5.11.5.4", alert.ErrorCode);
        Assert.AreEqual("GasMix Oxygen (O2) pressure sensor: The value has fallen below the required pressure", alert.Message);
        Assert.AreEqual("MaintenanceRequired", alert.Severity);
        Assert.AreEqual(400, alert.SeverityValue);
        Assert.AreEqual(DateTimeKind.Utc, alert.Time!.Value.Kind);
        Assert.AreEqual("2026-11-18T15:20:10.958", alert.Time.Value.ToString("yyyy-MM-ddTHH:mm:ss.fff", System.Globalization.CultureInfo.InvariantCulture));
        Assert.AreEqual("BasePlc", alert.SourceName);

        var failure = Decode(FeedHold);
        Assert.AreEqual("Failure", failure.Severity);
        Assert.AreEqual(800, failure.SeverityValue);
        Assert.AreEqual("VORSCHUB HALT-Taster", failure.Message);
    }

    [TestMethod]
    public void A_short_body_or_an_alert_without_id_is_not_decoded()
    {
        var body = Convert.FromBase64String(GasMixOxygen);

        Assert.IsNull(KnownStructures.DecodeAlert(body.AsSpan(0, body.Length - 12)));
        Assert.IsNull(KnownStructures.DecodeAlert([]));
        Assert.IsNull(KnownStructures.DecodeAlert([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "An empty Id is no alert.");
        Assert.IsNull(KnownStructures.SeverityName(0));
    }

    [TestMethod]
    public void The_value_of_the_node_is_read_as_a_list_of_alerts()
    {
        var namespaces = new Opc.Ua.NamespaceTable();
        var index = (ushort)namespaces.Append("urn:Z0009A0033:TRUMPF:UAInterfaces/" + Umati2);
        Opc.Ua.ExtensionObject Of(string type, string base64) =>
            new(new Opc.Ua.ExpandedNodeId(new Opc.Ua.NodeId(type, index)), Opc.Ua.ByteString.From(Convert.FromBase64String(base64)));

        var two = RawValues.AlertsOf(
            new Opc.Ua.Variant(new[] { Of("DataType.Alert.DefaultBinary", GasMixOxygen), Of("DataType.Alert.DefaultBinary", GasMixDifferential) }),
            namespaces);

        Assert.IsNotNull(two);
        CollectionAssert.AreEqual(new[] { "BasePlc.5.11.5.4", "BasePlc.5.11.5.5" }, two.Select(alert => alert.ErrorCode).ToArray());
        Assert.IsEmpty(RawValues.AlertsOf(new Opc.Ua.Variant(Array.Empty<Opc.Ua.ExtensionObject>()), namespaces)!, "An empty list: no alert stands.");
        Assert.IsEmpty(RawValues.AlertsOf(Opc.Ua.Variant.Null, namespaces)!, "No value: no alert stands.");
        Assert.IsNull(
            RawValues.AlertsOf(new Opc.Ua.Variant(new[] { Of("DataType.Status.DefaultBinary", "AwAAAAMAAAA=") }), namespaces),
            "Another structure is no list of alerts.");
        Assert.IsNull(RawValues.AlertsOf(new Opc.Ua.Variant("text"), namespaces));
    }

    [TestMethod]
    public void A_bad_or_undecodable_value_of_the_list_keeps_the_alerts_that_stand()
    {
        var namespaces = new Opc.Ua.NamespaceTable();
        var index = (ushort)namespaces.Append(Umati2);
        Opc.Ua.ExtensionObject Of(string type, string base64) =>
            new(new Opc.Ua.ExpandedNodeId(new Opc.Ua.NodeId(type, index)), Opc.Ua.ByteString.From(Convert.FromBase64String(base64)));
        var tracker = new AlertTracker(now: () => Now);
        var raised = AlertListValue.Take(
            tracker,
            new Opc.Ua.DataValue(new Opc.Ua.Variant(new[] { Of("DataType.Alert.DefaultBinary", GasMixOxygen), Of("DataType.Alert.DefaultBinary", FeedHold) })),
            namespaces,
            Now,
            out var notTaken);
        Assert.IsNull(notTaken);
        Assert.HasCount(2, raised!);

        var bad = AlertListValue.Take(tracker, Opc.Ua.DataValue.FromStatusCode(Opc.Ua.StatusCodes.BadCommunicationError), namespaces, Now.AddMinutes(1), out notTaken);
        Assert.IsNull(bad, "A bad value changes nothing.");
        StringAssert.Contains(notTaken, "BadCommunicationError", StringComparison.Ordinal);
        Assert.HasCount(2, tracker.Open);

        var other = AlertListValue.Take(
            tracker,
            new Opc.Ua.DataValue(new Opc.Ua.Variant(new[] { Of("DataType.Alert.DefaultBinary", GasMixOxygen), Of("DataType.Status.DefaultBinary", "AwAAAAMAAAA=") })),
            namespaces,
            Now.AddMinutes(2),
            out notTaken);
        Assert.IsNull(other, "A list the adapter cannot decode whole changes nothing, though one of its alerts left.");
        StringAssert.Contains(notTaken, "DataType.Alert", StringComparison.Ordinal);
        Assert.HasCount(2, tracker.Open);

        var empty = AlertListValue.Take(tracker, new Opc.Ua.DataValue(new Opc.Ua.Variant(Array.Empty<Opc.Ua.ExtensionObject>())), namespaces, Now.AddMinutes(3), out notTaken);
        Assert.IsNull(notTaken);
        Assert.IsTrue(empty!.All(change => change.Action == AlertAction.Cleared), "A good empty list clears every alert.");
        Assert.HasCount(2, empty!);
        Assert.IsEmpty(tracker.Open);
    }

    [TestMethod]
    public void A_new_list_raises_what_is_new_and_clears_what_left()
    {
        var tracker = new AlertTracker(now: () => Now);

        var first = tracker.Reconcile([Listed("1"), Listed("2")], Now);
        CollectionAssert.AreEqual(new[] { AlertAction.Raised, AlertAction.Raised }, first.Select(change => change.Action).ToArray());
        Assert.AreEqual(Now.AddMinutes(-5), first[0].At, "A raising takes the time of the alert.");
        Assert.AreEqual("Plc", first[0].Alert.SourceName);

        Assert.IsEmpty(tracker.Reconcile([Listed("1"), Listed("2")], Now), "The same list changes nothing.");

        var second = tracker.Reconcile([Listed("2"), Listed("3")], Now.AddMinutes(1));
        Assert.HasCount(2, second);
        Assert.AreEqual((AlertAction.Raised, "3"), (second[0].Action, second[0].Alert.ConditionId));
        Assert.AreEqual((AlertAction.Cleared, "1"), (second[1].Action, second[1].Alert.ConditionId));
        Assert.AreEqual(first[0].Alert.Id, second[1].Alert.Id, "The clearing has the id of the raising.");
        Assert.AreEqual(Now.AddMinutes(1), second[1].At);

        var empty = tracker.Reconcile([], Now.AddMinutes(2));
        Assert.IsTrue(empty.All(change => change.Action == AlertAction.Cleared));
        Assert.IsEmpty(tracker.Open);
    }

    [TestMethod]
    public void An_alert_of_the_list_keeps_the_category_of_the_server()
    {
        var tracker = new AlertTracker();

        var change = tracker.Reconcile([Decode(FeedHold), Listed("x", Now.AddDays(1)) with { Severity = null, SeverityValue = 0 }], Now);

        Assert.AreEqual("Failure", change[0].Alert.Severity);
        Assert.AreEqual("Failure", change[0].Alert.ToJson()["Severity"]!.GetValue<string>());
        Assert.AreEqual("MaintenanceRequired", change[1].Alert.Severity, "Without a category of the server it follows from the severity, 0 taken as 1.");
        Assert.AreEqual(1, change[1].Alert.SeverityValue);
        Assert.AreEqual(Now, change[1].At, "A time in the future is now.");
    }

    [TestMethod]
    public void An_alert_that_stood_in_the_last_run_is_raised_again_once_and_cleared_when_it_left()
    {
        var carried = new OpenAlert("1", "occurrence-1", "E1", "Message 1", 500, Now.AddHours(-1));
        var gone = new OpenAlert("9", "occurrence-9", "E9", "Message 9", 500, Now.AddHours(-1));
        var tracker = new AlertTracker([carried, gone], () => Now);

        var changes = tracker.Reconcile([Listed("1")], Now);

        Assert.HasCount(2, changes);
        Assert.AreEqual((AlertAction.Raised, "occurrence-1"), (changes[0].Action, changes[0].Alert.Id));
        Assert.AreEqual((AlertAction.Cleared, "occurrence-9"), (changes[1].Action, changes[1].Alert.Id));
        Assert.IsEmpty(tracker.Reconcile([Listed("1")], Now));
    }

    [TestMethod]
    public void A_machine_in_umati2_takes_its_alerts_from_the_list_whatever_the_scan_proposed()
    {
        var registration = new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://localhost:4842" },
            MachineNode = $"nsu={Umati2};s=Machine",
            Alerts = new AlertRegistration { EventType = "nsu=http://trumpf.com/TRUMPF-Interfaces/;i=1006" },
            Missing = [new MissingElement { Path = "Notification.ActiveAlerts", Reason = "No alarm type." }],
        };

        var applied = KnownMappings.Apply(registration);

        Assert.AreEqual($"nsu={Umati2};s=Notification.ActiveAlerts", applied.Alerts!.List);
        Assert.AreEqual(string.Empty, applied.Alerts.EventType);
        Assert.IsEmpty(applied.Missing);
        Assert.IsEmpty(RegistrationValidator.Validate(applied));
        Assert.AreEqual(applied.Alerts, KnownMappings.Apply(applied).Alerts, "Applying it twice changes nothing more.");
    }

    [TestMethod]
    public void Without_the_node_the_alerts_are_missing()
    {
        var applied = KnownMappings.Apply(new MachineRegistration { SerialNumber = "A0280O0001", MachineNode = $"nsu={Umati2};s=Machine" });

        var without = Umati2DataModel.WithoutAlertList(applied);

        Assert.IsNull(without.Alerts);
        Assert.AreEqual("Notification.ActiveAlerts", without.Missing.Single().Path);
        StringAssert.Contains(without.Missing.Single().Reason, "s=Notification.ActiveAlerts", StringComparison.Ordinal);
        Assert.IsFalse(DataModelProfiles.CoreOf(DataModelProfiles.Check(without)).Fulfilled);
        var events = applied with { Alerts = new AlertRegistration { EventType = "i=2915" } };
        Assert.AreSame(events, Umati2DataModel.WithoutAlertList(events), "Alerts of events are not the list of the rule.");
    }

    [TestMethod]
    public void A_list_is_a_portable_node_and_not_beside_an_event_type()
    {
        static IReadOnlyList<string> Problems(AlertRegistration alerts) => RegistrationValidator.Validate(new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://host:4840" },
            Elements = [new ElementRegistration { Path = "Identification.SerialNumber", Kind = ValueKind.Text, Node = "nsu=http://example.com/;i=1" }],
            Alerts = alerts,
        });

        Assert.IsEmpty(Problems(new AlertRegistration { List = $"nsu={Umati2};s=Notification.ActiveAlerts" }));
        Assert.IsTrue(Problems(new AlertRegistration { List = "ns=9;s=Notification.ActiveAlerts" }).Any(problem => problem.StartsWith("alerts.list:", StringComparison.Ordinal)));
        Assert.IsTrue(Problems(new AlertRegistration { List = $"nsu={Umati2};s=Notification.ActiveAlerts", EventType = "i=2915" }).Any(problem => problem.StartsWith("alerts:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void A_TRUMPF_machine_outside_umati2_takes_the_events_of_TcMachineAlarmType()
    {
        const string Prefix = "urn:A0280O0001:TRUMPF:OpcSimulator/";
        var registration = new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            MachineNode = $"nsu={Prefix}http://trumpf.com/UA/MachineTool/;i=3000",
            Elements = [new ElementRegistration { Path = "Identification.SerialNumber", Kind = ValueKind.Text, Node = $"nsu={Prefix}http://trumpf.com/UA/MachineTool/;i=3005" }],
            Missing = [new MissingElement { Path = "Notification.ActiveAlerts", Reason = "No alarm type found." }],
        };

        var applied = KnownMappings.Apply(registration);

        Assert.AreEqual($"nsu={Prefix}http://trumpf.com/TRUMPF-Interfaces/;i=1006", applied.Alerts!.EventType);
        Assert.AreEqual($"nsu={Prefix}http://trumpf.com/TRUMPF-Interfaces/;AlarmIdentifier", applied.Alerts.CodeField);
        Assert.IsNull(applied.Alerts.List);
        Assert.IsFalse(applied.Missing.Any(entry => entry.Path == "Notification.ActiveAlerts"));
        CollectionAssert.AreEquivalent(
            new[] { $"{Prefix}http://trumpf.com/UA/MachineTool/", $"{Prefix}http://trumpf.com/TRUMPF-Interfaces/" },
            MachineNamespaces.Of(applied).ToArray(),
            "The conditions lie in the TRUMPF interface, which counts as the machine's own.");
    }

    [TestMethod]
    public void Without_TcMachineAlarmType_on_the_server_the_alerts_of_the_fallback_are_missing()
    {
        const string Prefix = "urn:A0280O0001:TRUMPF:OpcSimulator/";
        var applied = KnownMappings.Apply(new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            MachineNode = $"nsu={Prefix}http://trumpf.com/UA/MachineTool/;i=3000",
        });

        var without = TrumpfAlarms.WithoutEventType(applied);

        Assert.IsNull(without.Alerts);
        var missing = without.Missing.Single();
        Assert.AreEqual("Notification.ActiveAlerts", missing.Path);
        StringAssert.Contains(missing.Reason, $"{Prefix}http://trumpf.com/TRUMPF-Interfaces/", StringComparison.Ordinal);
        var own = applied with { Alerts = new AlertRegistration { EventType = "nsu=http://trumpf.com/UA/Types/;i=42" } };
        Assert.AreSame(own, TrumpfAlarms.WithoutEventType(own), "An alarm type a person named is not the fallback's.");
        var list = KnownMappings.Apply(new MachineRegistration { SerialNumber = "A0280O0001", MachineNode = $"nsu={Umati2};s=Machine" });
        Assert.AreSame(list, TrumpfAlarms.WithoutEventType(list), "A list is no alarm type.");
    }

    [TestMethod]
    public void The_fallback_leaves_alerts_of_a_person_and_other_machines_as_they_are()
    {
        var own = new AlertRegistration { EventType = "nsu=http://trumpf.com/UA/Types/;i=42" };
        var trumpf = new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            Elements = [new ElementRegistration { Path = "Identification.SerialNumber", Kind = ValueKind.Text, Node = "nsu=http://trumpf.com/UA/MachineTool/;i=3005" }],
        };

        Assert.AreEqual("nsu=http://trumpf.com/TRUMPF-Interfaces/;i=1006", KnownMappings.Apply(trumpf).Alerts?.EventType, "A server of the machine itself has no prefix.");
        Assert.AreSame(own, KnownMappings.Apply(trumpf with { Alerts = own }).Alerts);
        var other = trumpf with
        {
            Elements = [new ElementRegistration { Path = "Identification.SerialNumber", Kind = ValueKind.Text, Node = "nsu=http://example.com/;i=1" }],
        };
        Assert.IsNull(KnownMappings.Apply(other).Alerts);
    }
}
