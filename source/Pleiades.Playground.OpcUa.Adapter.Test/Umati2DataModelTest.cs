using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class Umati2DataModelTest
{
    /// <summary>The namespace as the gateway of the edge device Z0009A0033 names it.</summary>
    private const string Uri = "urn:Z0009A0033:TRUMPF:UAInterfaces/" + Umati2DataModel.Namespace;

    private const string Machine = $"nsu={Uri};s=Machine";

    private static MachineRegistration Registration(params ElementRegistration[] elements) => new()
    {
        SerialNumber = "A0280O0001",
        Profiles = ["Core"],
        Endpoint = new EndpointRegistration { Url = "opc.tcp://Z0009A0033.sfh.edge-device.net:11878" },
        MachineNode = Machine,
        Elements = elements,
    };

    private static ElementRegistration Element(MachineRegistration registration, string path) =>
        registration.Elements.Single(element => element.Area == "umati" && element.Path == path);

    [TestMethod]
    public void A_machine_in_the_namespace_gets_every_element_by_the_adapter_and_passes_Core()
    {
        var applied = KnownMappings.Apply(Registration());

        Assert.HasCount(Umati2DataModel.Rules.Count, applied.Elements);
        Assert.AreEqual($"nsu={Uri};s=Identification.SerialNumber", Element(applied, "Identification.SerialNumber").Node);
        Assert.AreEqual($"nsu={Uri};s=Identification.Model", Element(applied, "Identification.Model").Node, "The model is the node of the namespace, not the serial number.");
        Assert.IsTrue(applied.Elements.All(element => element.Match == MatchKind.Direct));
        Assert.IsTrue(applied.Elements.All(element => element.Evidence!.StartsWith("Known mapping of the adapter for urn:umati2:datamodel:opcua", StringComparison.Ordinal)));
        Assert.IsEmpty(RegistrationValidator.Validate(applied));
        var withAlerts = applied with { Alerts = new AlertRegistration { EventType = "i=2915" } };
        Assert.IsTrue(DataModelProfiles.CoreOf(DataModelProfiles.Check(withAlerts)).Fulfilled, "With an alarm subscription the namespace gives the whole core.");
    }

    [TestMethod]
    public void Numbers_are_in_the_unit_of_the_binding_already()
    {
        var applied = KnownMappings.Apply(Registration());

        var feed = Element(applied, "State.FeedOverride");
        Assert.AreEqual(ValueKind.Number, feed.Kind);
        Assert.AreEqual("one", feed.Unit);
        Assert.IsNull(feed.Scale, "The node says 'Unit: one (C62)': 1 is 100 percent.");
        var powerOn = Element(applied, "OperationCounters.PowerOnDuration");
        Assert.AreEqual("second", powerOn.Unit);
        Assert.IsNull(powerOn.Scale, "The node says 'Unit: second (SEC)', not a Duration in milliseconds.");
    }

    [TestMethod]
    public void The_item_state_and_the_operation_mode_are_members_of_State_Status()
    {
        var applied = KnownMappings.Apply(Registration());

        var itemState = Element(applied, "State.MachineryItemState");
        Assert.AreEqual($"nsu={Uri};s=State.Status", itemState.Node);
        Assert.AreEqual("MachineryItemState", itemState.Field);
        Assert.AreEqual("Executing", itemState.Map!["3"]);
        var operationMode = Element(applied, "State.MachineryOperationMode");
        Assert.AreEqual($"nsu={Uri};s=State.Status", operationMode.Node);
        Assert.AreEqual("MachineryOperationMode", operationMode.Field);
        Assert.AreEqual("Processing", operationMode.Map!["3"]);
    }

    [TestMethod]
    public void What_the_scan_proposed_for_a_rule_is_replaced_and_the_rest_is_kept()
    {
        var guessed = new ElementRegistration
        {
            Path = "State.FeedOverride",
            Kind = ValueKind.Number,
            Unit = "one",
            Scale = 0.01,
            Node = $"nsu={Uri};s=State.FeedOverride",
            Match = MatchKind.Unclear,
        };
        var vendor = new ElementRegistration
        {
            Path = "Identification.ProductCode",
            Area = "oem",
            Kind = ValueKind.Text,
            Node = $"nsu={Uri};s=Identification.ProductCode",
        };
        var registration = Registration(guessed, vendor) with
        {
            Missing = [new MissingElement { Path = "State.MachineryItemState", Reason = "A structure." }],
        };

        var applied = KnownMappings.Apply(registration);

        Assert.IsNull(Element(applied, "State.FeedOverride").Scale);
        Assert.AreEqual(MatchKind.Direct, Element(applied, "State.FeedOverride").Match);
        Assert.IsTrue(applied.Elements.Contains(vendor));
        Assert.IsEmpty(applied.Missing);
    }

    [TestMethod]
    public void Without_a_machine_node_the_serial_number_names_the_namespace()
    {
        var registration = Registration(new ElementRegistration
        {
            Path = "Identification.SerialNumber",
            Kind = ValueKind.Text,
            Node = $"nsu={Umati2DataModel.Namespace};s=Identification.SerialNumber",
        }) with { MachineNode = null };

        var applied = KnownMappings.Apply(registration);

        Assert.AreEqual($"nsu={Umati2DataModel.Namespace};s=OperationCounters.PowerOnDuration", Element(applied, "OperationCounters.PowerOnDuration").Node);
    }

    [TestMethod]
    public void Another_namespace_is_left_as_it_is()
    {
        var registration = Registration(new ElementRegistration
        {
            Path = "Identification.SerialNumber",
            Kind = ValueKind.Text,
            Node = "nsu=urn:Z0009A0033:TRUMPF:UAInterfaces/http://trumpf.com/UA/MachineTool/;i=3005",
        }) with { MachineNode = "nsu=urn:Z0009A0033:TRUMPF:UAInterfaces/http://trumpf.com/UA/MachineTool/;i=3000" };

        Assert.AreSame(registration, Umati2DataModel.Apply(registration));
    }

    [TestMethod]
    public void Applying_twice_changes_nothing_more()
    {
        var once = KnownMappings.Apply(Registration());
        var twice = KnownMappings.Apply(once);

        CollectionAssert.AreEqual(once.Elements.ToList(), twice.Elements.ToList());
    }

    [TestMethod]
    public void An_element_the_server_does_not_have_is_missing_and_not_wrong()
    {
        var applied = KnownMappings.Apply(Registration());

        var without = Umati2DataModel.WithoutAbsent(applied, [("umati", "Identification.SoftwareRevision"), ("oem", "Other.Value")], out var removed);

        CollectionAssert.AreEqual(new[] { "Identification.SoftwareRevision" }, removed.ToArray());
        Assert.HasCount(applied.Elements.Count - 1, without.Elements);
        var missing = without.Missing.Single();
        Assert.AreEqual("Identification.SoftwareRevision", missing.Path);
        Assert.Contains("s=Identification.SoftwareRevision", missing.Reason);
        Assert.IsEmpty(RegistrationValidator.Validate(without));
    }

    [TestMethod]
    public void A_mandatory_element_the_server_does_not_have_fails_Core()
    {
        var applied = KnownMappings.Apply(Registration());

        var without = Umati2DataModel.WithoutAbsent(applied, [("umati", "OperationCounters.PowerOnDuration")], out _);

        CollectionAssert.Contains(DataModelProfiles.CoreOf(DataModelProfiles.Check(without)).Missing.ToArray(), "OperationCounters.PowerOnDuration");
    }

    [TestMethod]
    public void The_namespace_is_matched_as_it_is_and_behind_the_prefix_of_a_gateway()
    {
        Assert.IsTrue(KnownMappings.IsNamespace(Umati2DataModel.Namespace, Umati2DataModel.Namespace));
        Assert.IsTrue(KnownMappings.IsNamespace(Uri, Umati2DataModel.Namespace));
        Assert.IsFalse(KnownMappings.IsNamespace("urn:x:" + Umati2DataModel.Namespace, Umati2DataModel.Namespace), "A prefix ends with a slash.");
        Assert.IsFalse(KnownMappings.IsNamespace(Umati2DataModel.Namespace + "/x", Umati2DataModel.Namespace));
        Assert.IsFalse(KnownMappings.IsNamespace(null, Umati2DataModel.Namespace));
    }
}

[TestClass]
public class KnownStructuresTest
{
    private const string Encoding = "nsu=urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua;s=DataType.Status.DefaultBinary";

    [TestMethod]
    public void DataType_Status_is_two_enumerations()
    {
        // The body the gateway of Z0009A0033 sent on 2026-11-17: Executing, Processing.
        var status = KnownStructures.Decode(Encoding, Convert.FromBase64String("AwAAAAMAAAA="));

        Assert.IsNotNull(status);
        Assert.AreEqual(3, status.Member("MachineryItemState"));
        Assert.AreEqual(3, status.Member("MachineryOperationMode"));
        Assert.AreEqual("MachineryItemState=3, MachineryOperationMode=3", status.ToString());
    }

    [TestMethod]
    public void Another_structure_or_a_short_body_is_not_decoded()
    {
        Assert.IsNull(KnownStructures.Decode(Encoding.Replace("Status", "Alert", StringComparison.Ordinal), new byte[8]));
        Assert.IsNull(KnownStructures.Decode("nsu=http://example.com/;s=DataType.Status.DefaultBinary", new byte[8]));
        Assert.IsNull(KnownStructures.Decode(Encoding, new byte[7]));
        Assert.IsNull(KnownStructures.Decode(null, new byte[8]));
    }

    [TestMethod]
    public void A_structure_the_session_does_not_know_is_decoded_from_its_bytes()
    {
        var namespaces = new Opc.Ua.NamespaceTable();
        var index = namespaces.Append("urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua");
        var typeId = new Opc.Ua.ExpandedNodeId(new Opc.Ua.NodeId("DataType.Status.DefaultBinary", (ushort)index));
        var body = Opc.Ua.ByteString.From(Convert.FromBase64String("AwAAAAMAAAA="));
        var extension = new Opc.Ua.ExtensionObject(typeId, body);

        var raw = OpcUa.RawValues.Of(new Opc.Ua.Variant(extension), namespaces);

        Assert.IsInstanceOfType<StructureValue>(raw);
        Assert.AreEqual(3, ((StructureValue)raw).Member("MachineryItemState"));
        var other = new Opc.Ua.ExtensionObject(new Opc.Ua.ExpandedNodeId(new Opc.Ua.NodeId("DataType.Alert.DefaultBinary", (ushort)index)), body);
        Assert.IsNotInstanceOfType<StructureValue>(OpcUa.RawValues.Of(new Opc.Ua.Variant(other), namespaces), "Another structure stays as the stack gave it.");
    }

    [TestMethod]
    public void An_element_takes_its_member_and_maps_it()
    {
        var applied = KnownMappings.Apply(new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            MachineNode = "nsu=urn:umati2:datamodel:opcua;s=Machine",
        });
        var itemState = applied.Elements.Single(element => element.Path == "State.MachineryItemState");
        var operationMode = applied.Elements.Single(element => element.Path == "State.MachineryOperationMode");
        var status = KnownStructures.Decode(Encoding, [2, 0, 0, 0, 1, 0, 0, 0]);

        Assert.AreEqual("NotExecuting", ValueConverter.Convert(itemState, status)!.Text);
        Assert.AreEqual("Maintenance", ValueConverter.Convert(operationMode, status)!.Text);
        Assert.IsNull(ValueConverter.Convert(itemState, 3), "A member is taken from a structure only.");
        Assert.IsNull(ValueConverter.Convert(itemState with { Field = "Other" }, status));
        Assert.IsNull(ValueConverter.Convert(new ElementRegistration { Kind = ValueKind.Text }, status), "A structure is no value of its own.");
    }
}
