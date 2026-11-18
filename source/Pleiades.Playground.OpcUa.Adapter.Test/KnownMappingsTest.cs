using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class KnownMappingsTest
{
    private const string TrumpfSerialNumber = "nsu=http://trumpf.com/UA/MachineTool/;i=3005";

    private static MachineRegistration Registration(string serialNumberNode, params ElementRegistration[] more) => new()
    {
        SerialNumber = "A0280O0001",
        Endpoint = new EndpointRegistration { Url = "opc.tcp://A0280O0001:4840" },
        Elements =
        [
            new ElementRegistration { Path = "Identification.Manufacturer", Kind = ValueKind.Text, Node = "nsu=http://trumpf.com/UA/MachineTool/;i=3003" },
            new ElementRegistration { Path = "Identification.SerialNumber", Kind = ValueKind.Text, Node = serialNumberNode },
            .. more,
        ],
    };

    private static ElementRegistration Model(MachineRegistration registration) =>
        registration.Elements.Single(element => element.Area == "umati" && element.Path == "Identification.Model");

    [TestMethod]
    public void On_a_TRUMPF_machine_tool_the_model_is_the_node_of_the_serial_number()
    {
        var applied = KnownMappings.Apply(Registration(TrumpfSerialNumber));

        var model = Model(applied);
        Assert.AreEqual(TrumpfSerialNumber, model.Node);
        Assert.AreEqual(ValueKind.Text, model.Kind);
        Assert.AreEqual(MatchKind.Derived, model.Match);
        Assert.Contains("Known mapping of the adapter", model.Evidence!);
    }

    [TestMethod]
    public void A_model_the_scan_guessed_is_replaced_in_its_place()
    {
        var guessed = new ElementRegistration
        {
            Path = "Identification.Model",
            Kind = ValueKind.Text,
            Node = "nsu=http://trumpf.com/UA/MachineTool/;i=3048",
            Match = MatchKind.Unclear,
            Evidence = "Software/Identifier reads L26.",
        };
        var registration = Registration(TrumpfSerialNumber, guessed);

        var applied = KnownMappings.Apply(registration);

        Assert.HasCount(registration.Elements.Count, applied.Elements);
        Assert.AreEqual(2, applied.Elements.ToList().FindIndex(element => element.Path == "Identification.Model"));
        Assert.AreEqual(TrumpfSerialNumber, Model(applied).Node);
        Assert.AreEqual(MatchKind.Derived, Model(applied).Match);
    }

    [TestMethod]
    public void A_model_the_rule_sets_is_no_longer_missing()
    {
        var registration = Registration(TrumpfSerialNumber) with
        {
            Missing = [new MissingElement { Path = "Identification.Model", Reason = "No Model node." }],
        };

        var applied = KnownMappings.Apply(registration);

        Assert.IsEmpty(applied.Missing);
        Assert.AreEqual(TrumpfSerialNumber, Model(applied).Node);
    }

    [TestMethod]
    public void Another_namespace_is_left_to_the_scan()
    {
        var registration = Registration("nsu=http://example.com/UA/MachineTool/;i=3005");

        var applied = KnownMappings.Apply(registration);

        Assert.IsFalse(applied.Elements.Any(element => element.Path == "Identification.Model"));
    }

    [TestMethod]
    public void Applying_twice_changes_nothing_more()
    {
        var once = KnownMappings.Apply(Registration(TrumpfSerialNumber));
        var twice = KnownMappings.Apply(once);

        CollectionAssert.AreEqual(once.Elements.ToList(), twice.Elements.ToList());
    }

    [TestMethod]
    public void Every_known_mapping_gives_a_registration_the_validator_accepts()
    {
        var applied = KnownMappings.Apply(Registration(TrumpfSerialNumber));

        Assert.IsEmpty(RegistrationValidator.Validate(applied));
    }

    [TestMethod]
    public void The_namespace_of_a_node_is_read_from_its_URI_form_only()
    {
        Assert.AreEqual("http://trumpf.com/UA/MachineTool/", KnownMappings.NamespaceOf(TrumpfSerialNumber));
        Assert.IsNull(KnownMappings.NamespaceOf("ns=7;i=3005"));
        Assert.IsNull(KnownMappings.NamespaceOf("i=2253"));
        Assert.IsNull(KnownMappings.NamespaceOf("nsu=;i=1"));
        Assert.IsNull(KnownMappings.NamespaceOf(null));
    }
}
