using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class DataModelProfilesTest
{
    private const string Ns = "nsu=http://example.com/;s=";

    private static readonly string[] CorePaths =
    [
        "Identification.Manufacturer",
        "Identification.SerialNumber",
        "Identification.ProductInstanceUri",
        "Identification.ManufacturerUri",
        "Identification.Model",
        "Identification.ProductCode",
        "Identification.YearOfConstruction",
        "State.MachineryItemState",
        "State.MachineryOperationMode",
        "State.FeedOverride",
        "OperationCounters.PowerOnDuration",
    ];

    private static ElementRegistration Element(string path, string area = "umati") =>
        new() { Path = path, Area = area, Kind = ValueKind.Text, Node = Ns + path };

    private static MachineRegistration Registration(IEnumerable<string> paths, bool alerts = true) => new()
    {
        SerialNumber = "M1",
        Endpoint = new EndpointRegistration { Url = "opc.tcp://m1:4840" },
        Elements = [.. paths.Select(path => Element(path))],
        Alerts = alerts ? new AlertRegistration { EventType = "i=2915" } : null,
    };

    private static ProfileCheck Profile(IReadOnlyList<ProfileCheck> checks, string name) => checks.Single(check => check.Name == name);

    [TestMethod]
    public void The_core_is_fulfilled_with_its_elements_and_an_alarm_subscription()
    {
        var core = DataModelProfiles.CoreOf(DataModelProfiles.Check(Registration(CorePaths)));

        Assert.IsTrue(core.Fulfilled);
        Assert.IsTrue(core.Mandatory);
        Assert.IsEmpty(core.Missing, "Heartbeat and connection state come from the adapter.");
    }

    [TestMethod]
    public void The_core_without_alarms_or_one_element_names_what_it_lacks()
    {
        var checks = DataModelProfiles.Check(Registration(CorePaths.Where(path => path != "Identification.ProductCode"), alerts: false));

        CollectionAssert.AreEqual(
            new[] { "Identification.ProductCode", DataModelProfiles.ActiveAlertsPath },
            DataModelProfiles.CoreOf(checks).Missing.ToArray());
        Assert.IsFalse(DataModelProfiles.CoreOf(checks).Fulfilled);
    }

    [TestMethod]
    public void A_profile_that_is_not_complete_is_not_published_and_its_elements_are_missing()
    {
        var registration = Registration([.. CorePaths, "OperationCounters.OperationDuration", "State.IsWarmUp"]);

        var applied = DataModelProfiles.Apply(registration, out var checks);

        var monitoring = Profile(checks, "MonitoringExtended");
        Assert.IsFalse(monitoring.Fulfilled);
        Assert.IsTrue(monitoring.Offered);
        CollectionAssert.AreEqual(new[] { "OperationCounters.PartsProducedInLifetime" }, monitoring.Missing.ToArray());
        Assert.IsFalse(applied.Elements.Any(element => element.Path is "OperationCounters.OperationDuration" or "State.IsWarmUp"));
        StringAssert.Contains(applied.Missing.Single(entry => entry.Path == "State.IsWarmUp").Reason, "MonitoringExtended", StringComparison.Ordinal);
        CollectionAssert.AreEqual(new[] { "Core" }, applied.Profiles.ToArray());
    }

    [TestMethod]
    public void A_complete_profile_is_named_and_kept()
    {
        var applied = DataModelProfiles.Apply(
            Registration([.. CorePaths, "OperationCounters.PartsProducedInLifetime", "OperationCounters.OperationDuration", "State.IsWarmUp"]),
            out _);

        CollectionAssert.AreEqual(new[] { "Core", "MonitoringExtended" }, applied.Profiles.ToArray());
        Assert.HasCount(CorePaths.Length + 3, applied.Elements);
    }

    [TestMethod]
    public void Of_a_profile_with_instances_only_the_complete_instances_are_published()
    {
        string[] channel1 = ["Channel[1].ChannelState", "Channel[1].FeedOverride", "Channel[1].ChannelMode", "Channel[1].RapidOverride", "Channel[1].Name"];
        var applied = DataModelProfiles.Apply(Registration([.. CorePaths, .. channel1, "Channel[2].ChannelState"]), out var checks);

        var channels = Profile(checks, "ChannelMonitoring");
        Assert.IsTrue(channels.Fulfilled);
        CollectionAssert.AreEqual(new[] { "1" }, channels.Instances.ToArray());
        CollectionAssert.Contains(channels.Missing.ToArray(), "Channel[2].Name");
        Assert.IsTrue(channel1.All(path => applied.Elements.Any(element => element.Path == path)));
        Assert.IsFalse(applied.Elements.Any(element => element.Path == "Channel[2].ChannelState"));
        StringAssert.Contains(applied.Missing.Single(entry => entry.Path == "Channel[2].ChannelState").Reason, "instance 2", StringComparison.Ordinal);
    }

    [TestMethod]
    public void An_energy_profile_needs_its_measuring_point_Main()
    {
        string[] sub = ["Consumption.Electricity[Sub1].AcActivePowerTotal", "Consumption.Electricity[Sub1].AcActiveEnergyTotalImportHp"];

        var applied = DataModelProfiles.Apply(Registration([.. CorePaths, .. sub]), out var checks);

        var energy = Profile(checks, "EnergyElectricity");
        Assert.IsFalse(energy.Fulfilled);
        CollectionAssert.Contains(energy.Missing.ToArray(), "Consumption.Electricity[Main].AcActivePowerTotal");
        Assert.IsFalse(applied.Elements.Any(element => sub.Contains(element.Path)));
    }

    [TestMethod]
    public void Elements_of_no_profile_and_of_the_maker_are_kept()
    {
        var core = Registration([.. CorePaths, "Production.ActiveProgram"]);
        var registration = core with { Elements = [.. core.Elements, Element("ActivityMeters.DrivesOnDuration", "oem")] };

        var applied = DataModelProfiles.Apply(registration, out _);

        Assert.HasCount(registration.Elements.Count, applied.Elements);
    }

    [TestMethod]
    public void The_core_is_never_taken_out_and_the_alarms_are_not_missing_with_a_subscription()
    {
        var registration = Registration(["Identification.SerialNumber"]) with
        {
            Missing = [new MissingElement { Path = DataModelProfiles.ActiveAlertsPath, Reason = "A list." }],
        };

        var applied = DataModelProfiles.Apply(registration, out var checks);

        Assert.HasCount(1, applied.Elements);
        Assert.IsEmpty(applied.Missing);
        CollectionAssert.AreEqual(new[] { "Core" }, applied.Profiles.ToArray(), "The core is declared whole, also when the machine lacks parts of it.");
        Assert.IsFalse(DataModelProfiles.CoreOf(checks).Fulfilled);
    }

    [TestMethod]
    public void A_profile_nothing_maps_is_neither_offered_nor_fulfilled()
    {
        var spindle = Profile(DataModelProfiles.Check(Registration(CorePaths)), "Spindle");

        Assert.IsFalse(spindle.Offered);
        Assert.IsFalse(spindle.Fulfilled);
        CollectionAssert.Contains(spindle.Missing.ToArray(), "Spindle[n].IsRotating");
    }

    [TestMethod]
    [DataRow("Channel[1].ChannelState", "ChannelMonitoring", "1")]
    [DataRow("Consumption.Electricity[Main].AcActivePowerTotal", "EnergyElectricity", "Main")]
    [DataRow("Spindle[2].Name", "Spindle", "2")]
    public void An_instance_path_belongs_to_its_profile(string path, string profile, string instance)
    {
        var definition = DataModelProfiles.All.Single(one => one.Name == profile);

        Assert.IsTrue(DataModelProfiles.Belongs(definition, path, out var key));
        Assert.AreEqual(instance, key);
        Assert.IsFalse(DataModelProfiles.Belongs(definition, "Channel[1].Unknown", out _));
    }
}
