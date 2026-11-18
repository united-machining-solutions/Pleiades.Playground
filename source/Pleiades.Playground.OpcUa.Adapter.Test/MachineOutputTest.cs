using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using MQTTnet;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Testing;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>What the adapter puts on the broker for a machine, by the binding of machines (contracts/mqtt).</summary>
[TestClass]
public class MachineOutputTest
{
    private const string MachineId = "trumpf_TruLaser-5030_A0280O0001";
    private const string Root = "machines/" + MachineId;
    private static readonly DateTimeOffset Start = new(2026, 11, 18, 9, 0, 0, TimeSpan.Zero);

    private static readonly IdentityRegistration Identity = new()
    {
        Manufacturer = "TRUMPF",
        ManufacturerUri = "https://www.trumpf.com",
        Model = "TruLaser 5030",
        ProductInstanceUri = "https://www.trumpf.com/TruLaser 5030/A0280O0001",
    };

    [TestMethod]
    public void The_machine_id_is_formed_from_the_identification()
    {
        var values = new Dictionary<string, string>
        {
            ["Identification.Manufacturer"] = "TRUMPF",
            ["Identification.ManufacturerUri"] = "https://www.trumpf.com",
            ["Identification.Model"] = "TruLaser 5030",
            ["Identification.ProductInstanceUri"] = "urn:trumpf:A0280O0001",
        };

        var identity = MachineOutput.IdentityOf(path => values.GetValueOrDefault(path), "A0280O0001");

        Assert.IsNotNull(identity);
        Assert.AreEqual(MachineId, identity.MachineId);
        Assert.IsNull(MachineOutput.IdentityOf(path => path == "Identification.Model" ? null : values.GetValueOrDefault(path), "A0280O0001"),
            "Without a model there is no machine id.");
        Assert.IsNull(MachineOutput.IdentityOf(path => path == "Identification.ManufacturerUri" ? null : values.GetValueOrDefault(path), "A0280O0001"),
            "Without the web address of the manufacturer there is no machine id.");
        var formed = MachineOutput.IdentityOf(
            path => path is "Identification.ProductInstanceUri" or "Identification.Manufacturer" ? null : values.GetValueOrDefault(path), "A0280O0001")!;
        Assert.AreEqual("https://www.trumpf.com/TruLaser%205030/A0280O0001", formed.ProductInstanceUri, "Formed as the binding forms it.");
        Assert.AreEqual("trumpf.com", formed.Manufacturer, "Named by the domain of its web address.");
    }

    [TestMethod]
    public void The_manifest_names_the_profiles_the_elements_on_their_paths_and_the_alert_events()
    {
        var manifest = MachineOutput.Manifest(Registration(), Identity, TimeSpan.FromSeconds(10));

        Assert.AreEqual(MachineId, (string?)manifest["machineId"]);
        Assert.AreEqual("0.17.1", (string?)manifest["modelVersion"]);
        CollectionAssert.AreEqual(new[] { "Core", "EnergyElectricity" }, Strings(manifest["profiles"]));
        var elements = manifest["elements"]!.AsArray().Select(element => element!.AsObject()).ToList();
        var paths = elements.Select(element => (string)element["path"]!).ToList();
        CollectionAssert.Contains(paths, "State.Status");
        CollectionAssert.DoesNotContain(paths, "State.MachineryItemState");
        CollectionAssert.Contains(paths, "Consumption.Electricity.Main.AcActiveEnergyTotalImportHp");
        CollectionAssert.Contains(paths, "Notification.ActiveAlerts");
        Assert.IsFalse(elements.Any(element => element["available"] is not null), "The core is delivered whole.");
        var signal = elements.Single(element => (string)element["path"]! == "x-trumpf-com.Laser.Power");
        Assert.AreEqual("number", (string?)signal["type"]);
        Assert.AreEqual("watt", (string?)signal["unit"]!["name"]);
        CollectionAssert.AreEqual(new[] { "Notification.AlertRaised", "Notification.AlertCleared" },
            manifest["events"]!.AsArray().Select(e => (string)e!["path"]!).ToArray());
    }

    [TestMethod]
    public async Task A_core_the_machine_lacks_a_part_of_is_declared_whole_and_the_part_goes_out_once_as_null()
    {
        var full = Registration();
        var registration = full with { Elements = [.. full.Elements.Where(element => element.Path != "OperationCounters.PowerOnDuration")] };

        var manifest = MachineOutput.Manifest(registration, Identity, TimeSpan.FromSeconds(10));
        var (output, client) = Output(registration);
        await output.StartAsync();
        await output.ReachedAsync();
        await output.ReachedAsync();

        CollectionAssert.Contains(Strings(manifest["profiles"]), "Core", "The core is declared, although the machine lacks a part of it.");
        var lacking = manifest["elements"]!.AsArray().Select(element => element!.AsObject())
            .Single(element => (string)element["path"]! == "OperationCounters.PowerOnDuration");
        Assert.IsFalse((bool)lacking["available"]!, "What the machine lacks is not available.");
        var nulls = client.Take().Where(m => m.Topic == $"{Root}/umati/OperationCounters/PowerOnDuration").ToList();
        Assert.HasCount(1, nulls, "It goes out once, not with every answer of the machine.");
        var payload = Payload(nulls[0]);
        Assert.IsTrue(payload.ContainsKey("value") && payload["value"] is null, "Not available right now: value null.");
        Assert.IsTrue(nulls[0].Retain);
    }

    [TestMethod]
    public async Task Initializing_the_manifest_and_the_identity_go_out_first_and_Running_after_the_values()
    {
        var (output, client) = Output();
        await output.StartAsync();

        var first = client.Take();
        Assert.AreEqual($"{Root}/umati/Connection/State", first[0].Topic);
        Assert.AreEqual("Initializing", (string?)Payload(first[0])["value"]);
        Assert.AreEqual($"{Root}/umati/Manifest", first[1].Topic);
        Assert.AreEqual("TRUMPF", (string?)Payload(first.Single(m => m.Topic == $"{Root}/umati/Identification/Manufacturer"))["value"]);
        Assert.IsFalse(first.Any(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal) && (string?)Payload(m)["value"] == "Running"));
        Assert.AreEqual($"opcua-adapter-{MachineId}", client.Options!.ClientOptions.ClientId);
        Assert.AreEqual($"{Root}/umati/Connection/State", client.Options.ClientOptions.WillTopic, "Every machine has its own last will.");

        var registration = Registration();
        await output.ValueAsync(Element(registration, "State.MachineryItemState"), new ConvertedValue(null, "Executing", null), Start.UtcDateTime);
        await output.ValueAsync(Element(registration, "State.MachineryOperationMode"), new ConvertedValue(null, "Processing", null), Start.UtcDateTime);
        await output.ValueAsync(Element(registration, "Consumption.Electricity[Main].AcActiveEnergyTotalImportHp"), new ConvertedValue(1850500, null, null), Start.UtcDateTime);
        await output.ValueAsync(Element(registration, "Identification.YearOfConstruction"), new ConvertedValue(2019, null, null), Start.UtcDateTime);
        Assert.IsEmpty(client.Take(), "Before the machine answers the values only gather.");

        await output.ReachedAsync();

        var reached = client.Take();
        var status = Payload(reached.Single(m => m.Topic == $"{Root}/umati/State/Status"));
        Assert.AreEqual("Executing", (string?)status["value"]!["MachineryItemState"]);
        Assert.AreEqual("Processing", (string?)status["value"]!["MachineryOperationMode"]);
        var energy = Payload(reached.Single(m => m.Topic == $"{Root}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp"));
        Assert.AreEqual(1850500.0, (double?)energy["value"]);
        Assert.AreEqual("wattHour", (string?)energy["unit"]);
        Assert.IsNull(Payload(reached.Single(m => m.Topic == $"{Root}/umati/Identification/YearOfConstruction"))["unit"], "A year has no unit.");
        Assert.AreEqual("[]", Payload(reached.Single(m => m.Topic == $"{Root}/umati/Notification/ActiveAlerts"))["value"]!.ToJsonString());
        Assert.AreEqual($"{Root}/umati/Connection/State", reached[^1].Topic);
        Assert.AreEqual("Running", (string?)Payload(reached[^1])["value"]);
        Assert.IsTrue(reached.All(m => m.Retain), "Values are retained.");
    }

    [TestMethod]
    public async Task A_machine_that_does_not_answer_is_a_CommunicationFault_once()
    {
        var (output, client) = Output();
        await output.StartAsync();
        client.Take();

        await output.LostAsync();
        await output.LostAsync();

        var states = client.Take().Where(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)).ToList();
        Assert.HasCount(1, states);
        Assert.AreEqual("CommunicationFault", (string?)Payload(states[0])["value"]);
    }

    [TestMethod]
    public async Task An_alert_is_a_CloudEvent_and_the_list_of_the_alerts_that_stand()
    {
        var (output, client) = Output();
        await output.StartAsync();
        await output.ReachedAsync();
        client.Take();
        var tracker = new AlertTracker();
        var raised = tracker.Observe("c1", active: true, "4711", "Coolant low", 800, Start.UtcDateTime)!;

        await output.AlertAsync(raised, tracker.Open);

        var sent = client.Take();
        var message = sent.Single(m => m.Topic == $"{Root}/events/notifications");
        Assert.IsFalse(message.Retain, "An event is not retained.");
        Assert.AreEqual(MachineOutput.EventContentType, message.ContentType);
        var cloudEvent = Payload(message);
        Assert.AreEqual("1.0", (string?)cloudEvent["specversion"]);
        Assert.AreEqual("Notification.AlertRaised", (string?)cloudEvent["type"]);
        Assert.AreEqual("https://www.trumpf.com/TruLaser%205030/A0280O0001", (string?)cloudEvent["source"]);
        Assert.IsTrue(((string)cloudEvent["sequence"]!).EndsWith(".000000000001", StringComparison.Ordinal), "The first alert event of a run counts 1.");
        Assert.AreEqual("Failure", (string?)cloudEvent["data"]!["Severity"]);
        Assert.AreEqual(raised.Alert.Id, (string?)cloudEvent["data"]!["Id"]);
        var list = Payload(sent.Single(m => m.Topic == $"{Root}/umati/Notification/ActiveAlerts"))["value"]!.AsArray();
        Assert.HasCount(1, list);
        Assert.AreEqual("4711", (string?)list[0]!["ErrorCode"]);
    }

    [TestMethod]
    public async Task Without_an_identity_nothing_goes_out_until_the_machine_is_identified()
    {
        var registration = Registration() with { Identity = null };
        var (output, client) = Output(registration);
        await output.StartAsync();
        var tracker = new AlertTracker();
        await output.AlertAsync(tracker.Observe("c1", active: true, "4711", "Coolant low", 800, Start.UtcDateTime)!, tracker.Open);

        Assert.IsNull(output.MachineId);
        Assert.IsEmpty(client.Messages);

        await output.IdentifyAsync(Identity);

        Assert.AreEqual(MachineId, output.MachineId);
        var cloudEvent = Payload(client.Take().Single(m => m.Topic == $"{Root}/events/notifications"));
        Assert.AreEqual("https://www.trumpf.com/TruLaser%205030/A0280O0001", (string?)cloudEvent["source"], "The event that waited gets its source.");
    }

    [TestMethod]
    public async Task A_stopped_machine_says_Shutdown_and_a_removed_one_takes_its_retained_messages_back()
    {
        var (stopped, stoppedClient) = Output();
        await stopped.StartAsync();
        stoppedClient.Take();
        await stopped.StopAsync(removed: false);
        Assert.AreEqual("Shutdown", (string?)Payload(stoppedClient.Take()[^1])["value"]);

        var (removed, removedClient) = Output();
        await removed.StartAsync();
        await removed.ValueAsync(Element(Registration(), "State.FeedOverride"), new ConvertedValue(1, null, null), Start.UtcDateTime);
        await removed.ReachedAsync();
        removedClient.Take();
        await removed.StopAsync(removed: true);

        var cleared = removedClient.Take();
        Assert.IsTrue(cleared.All(m => m.Retain && m.Payload.IsEmpty), "An empty retained message takes a retained one back.");
        var topics = cleared.Select(m => m.Topic).ToList();
        Assert.AreEqual($"{Root}/umati/Manifest", topics[^1], "The manifest goes last.");
        CollectionAssert.Contains(topics, $"{Root}/umati/State/FeedOverride");
        CollectionAssert.Contains(topics, $"{Root}/umati/Connection/State");
        CollectionAssert.Contains(topics, $"{Root}/oem/Laser/Power");
    }

    private static (MachineOutput Output, RecordingManagedMqttClient Client) Output(MachineRegistration? registration = null)
    {
        var client = new RecordingManagedMqttClient();
        var config = new Config
        {
            MqttDestination = new MqttConfig { ConnectionString = "mqtt://broker:1883", ClientId = "opcua-adapter" },
            Loki = new SerilogLokiConfig { Sinks = [] },
        };
        var output = new MachineOutput(registration ?? Registration(), [], config, NullLoggerFactory.Instance, new ManualTimeProvider(Start), () => client);
        return (output, client);
    }

    private static MachineRegistration Registration() => new()
    {
        SerialNumber = "A0280O0001",
        Identity = Identity,
        Profiles = ["Core", "EnergyElectricity"],
        Endpoint = new EndpointRegistration { Url = "opc.tcp://A0280O0001:4840" },
        Alerts = new AlertRegistration { EventType = "nsu=http://opcfoundation.org/UA/;i=2915" },
        Elements =
        [
            Text("Identification.Manufacturer"),
            Text("Identification.SerialNumber"),
            Text("Identification.ProductInstanceUri"),
            Text("Identification.ManufacturerUri"),
            Text("Identification.Model"),
            Text("Identification.ProductCode"),
            Number("Identification.YearOfConstruction", null),
            Text("State.MachineryItemState"),
            Text("State.MachineryOperationMode"),
            Number("State.FeedOverride", "one"),
            Number("OperationCounters.PowerOnDuration", "second"),
            Number("Consumption.Electricity[Main].AcActivePowerTotal", "watt"),
            Number("Consumption.Electricity[Main].AcActiveEnergyTotalImportHp", "wattHour"),
            Number("Laser.Power", "watt") with { Area = "oem", Evidence = "Power of the laser." },
        ],
    };

    private static ElementRegistration Text(string path) =>
        new() { Path = path, Kind = ValueKind.Text, Node = $"nsu=urn:test;s={path}" };

    private static ElementRegistration Number(string path, string? unit) =>
        new() { Path = path, Kind = ValueKind.Number, Unit = unit, Node = $"nsu=urn:test;s={path}" };

    private static ElementRegistration Element(MachineRegistration registration, string path) =>
        registration.Elements.Single(element => element.Path == path);

    private static JsonObject Payload(MqttApplicationMessage message) => RecordingManagedMqttClient.Json(message);

    private static string[] Strings(JsonNode? array) => [.. array!.AsArray().Select(node => (string)node!)];
}

/// <summary>A registration of version 1, with numbers in coherent SI units, as this adapter runs it now.</summary>
[TestClass]
public class RegistrationMigrationTest
{
    [TestMethod]
    public void Energy_in_joule_becomes_wattHour_and_a_year_loses_its_unit()
    {
        var old = new MachineRegistration
        {
            SchemaVersion = 1,
            SerialNumber = "A0280O0001",
            Elements =
            [
                new() { Path = "Consumption.Electricity[Main].AcActiveEnergyTotalImportHp", Kind = ValueKind.Number, Unit = "joule", Scale = 3600000 },
                new() { Path = "Identification.YearOfConstruction", Kind = ValueKind.Number, Unit = "one" },
                new() { Path = "OperationCounters.PartsProducedInLifetime", Kind = ValueKind.Number, Unit = "one" },
                new() { Path = "Laser.Energy", Area = "vendor", Kind = ValueKind.Number, Unit = "joule" },
            ],
        };

        var migrated = RegistrationStore.Migrate(old);

        Assert.AreEqual(MachineRegistration.CurrentSchemaVersion, migrated.SchemaVersion);
        Assert.AreEqual("wattHour", migrated.Elements[0].Unit);
        Assert.AreEqual(1000.0, migrated.Elements[0].Scale!.Value, 1e-9, "Kilowatt hours to wattHour.");
        Assert.IsNull(migrated.Elements[1].Unit);
        Assert.AreEqual("piece", migrated.Elements[2].Unit);
        Assert.AreEqual("joule", migrated.Elements[3].Unit, "A signal of the maker is left as it is; a new proposal fixes it.");
        Assert.AreEqual("oem", migrated.Elements[3].Area, "The earlier name of the area is moved over.");
        Assert.AreSame(migrated, RegistrationStore.Migrate(migrated));
    }

    [TestMethod]
    public void A_number_of_the_model_needs_the_unit_of_its_catalogue()
    {
        var registration = new MachineRegistration
        {
            SerialNumber = "A0280O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://A0280O0001:4840" },
            Elements =
            [
                new() { Path = "Consumption.Electricity[Main].AcActiveEnergyTotalImportHp", Kind = ValueKind.Number, Unit = "joule", Node = "nsu=urn:a;i=1" },
                new() { Path = "Identification.YearOfConstruction", Kind = ValueKind.Number, Unit = "one", Node = "nsu=urn:a;i=2" },
                new() { Path = "Laser.Power", Area = "oem", Kind = ValueKind.Number, Unit = "kilowatt", Node = "nsu=urn:a;i=3" },
                new() { Path = "Laser.Temperature", Area = "oem", Kind = ValueKind.Number, Unit = "degreeCelsius", Node = "nsu=urn:a;i=4" },
            ],
        };

        var problems = RegistrationValidator.Validate(registration);

        Assert.IsTrue(problems.Any(p => p.Contains("AcActiveEnergyTotalImportHp", StringComparison.Ordinal) && p.Contains("wattHour", StringComparison.Ordinal)));
        Assert.IsTrue(problems.Any(p => p.Contains("YearOfConstruction", StringComparison.Ordinal) && p.Contains("no unit", StringComparison.Ordinal)));
        Assert.IsTrue(problems.Any(p => p.Contains("Laser.Power", StringComparison.Ordinal)));
        Assert.IsFalse(problems.Any(p => p.Contains("Laser.Temperature", StringComparison.Ordinal)));
    }
}
