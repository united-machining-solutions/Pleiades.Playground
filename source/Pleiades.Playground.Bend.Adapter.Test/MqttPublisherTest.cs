using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MQTTnet;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Mqtt.Extensions.Testing;

namespace Pleiades.Playground.Bend.Adapter.Test;

/// <summary>What goes on the broker: the tree, the payloads and the events of the binding of machines.</summary>
[TestClass]
public sealed class MqttPublisherTest
{
    private const string MachineId = "trumpf_Bend5130_B-01";
    private const string Root = "machines/" + MachineId + "/";

    private static readonly DateTimeOffset Now = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTime Earlier = Now.UtcDateTime.AddMinutes(-5);

    [TestMethod]
    public void The_machine_id_follows_the_rule_of_the_binding()
    {
        Assert.AreEqual(MachineId, BendTranslatorTest.Identity.MachineId);
    }

    [TestMethod]
    public async Task The_connect_sequence_then_the_values_of_the_machine_then_Running()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = BendTranslatorTest.Translator(Now);

        await publisher.StartAsync();
        var start = client.Take();
        await publisher.ReachedAsync([.. translator.Translate(new OperatingStateObserved(Earlier, 1, "", "")), .. translator.Current()]);
        var reached = client.Take();

        Assert.AreEqual(Root + "umati/Connection/State", start[0].Topic);
        Assert.AreEqual("Initializing", (string?)RecordingManagedMqttClient.Json(start[0])["value"]);
        Assert.AreEqual(Root + "umati/Manifest", start[1].Topic, "The manifest comes before the values.");
        Assert.AreEqual("TRUMPF", Value(start, "umati/Identification/Manufacturer"));
        Assert.AreEqual("B-01", Value(start, "umati/Identification/SerialNumber"));
        Assert.AreEqual("Bend5130", Value(start, "umati/Identification/Model"));
        Assert.AreEqual("https://www.trumpf.com/Bend5130/B-01", Value(start, "umati/Identification/ProductInstanceUri"));
        Assert.IsTrue(start.All(m => m.Retain && m.ContentType == MachineBinding.ContentType));

        Assert.AreEqual(Root + "umati/Connection/State", reached[^1].Topic);
        Assert.AreEqual("Running", (string?)RecordingManagedMqttClient.Json(reached[^1])["value"], "Running once the values of the machine are out.");
        var status = RecordingManagedMqttClient.Json(reached.Single(m => m.Topic == Root + "umati/State/Status"));
        Assert.AreEqual("Executing", (string?)status["value"]!["MachineryItemState"]);
        var state = RecordingManagedMqttClient.Json(reached.Single(m => m.Topic == Root + "oem/Rci/OperatingState"));
        Assert.AreEqual(1, (int?)state["value"]);
        Assert.AreEqual("one", (string?)state["unit"]);
    }

    [TestMethod]
    public async Task A_fault_is_a_CloudEvent_on_events_notifications_numbered_in_its_group()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = BendTranslatorTest.Translator(Now);
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Current());
        client.Take();

        await publisher.ReachedAsync(translator.Translate(new OperatingStateObserved(Earlier, -1, "4711", "Light curtain")));
        await publisher.ReachedAsync(translator.Translate(new OperatingStateObserved(Earlier.AddSeconds(5), 0, "", "")));
        var messages = client.Take();

        var events = messages.Where(m => m.Topic == Root + "events/notifications").ToList();
        Assert.HasCount(2, events);
        Assert.IsTrue(events.All(e => !e.Retain && e.ContentType == MqttPublisher.EventContentType));
        var raised = RecordingManagedMqttClient.Json(events[0]);
        var cleared = RecordingManagedMqttClient.Json(events[1]);
        Assert.AreEqual("1.0", (string?)raised["specversion"]);
        Assert.AreEqual(Paths.AlertRaised, (string?)raised["type"]);
        Assert.AreEqual(Paths.AlertCleared, (string?)cleared["type"]);
        Assert.AreEqual("https://www.trumpf.com/Bend5130/B-01", (string?)raised["source"]);
        Assert.EndsWith(".000000000001", (string?)raised["sequence"]);
        Assert.EndsWith(".000000000002", (string?)cleared["sequence"]);
        Assert.AreEqual("RCI-4711", (string?)raised["data"]!["ErrorCode"]);
        Assert.AreEqual((string?)raised["data"]!["Id"], (string?)cleared["data"]!["Id"]);

        var lists = messages.Where(m => m.Topic == Root + "umati/Notification/ActiveAlerts")
            .Select(m => RecordingManagedMqttClient.Json(m)["value"]!.AsArray().Count).ToList();
        CollectionAssert.AreEqual(new[] { 1, 0 }, lists);
        var order = messages.Where(m => m.Topic == Root + "events/notifications" || m.Topic == Root + "umati/Notification/ActiveAlerts")
            .Select(m => m.Topic.EndsWith("ActiveAlerts", StringComparison.Ordinal) ? "list" : "event").ToList();
        CollectionAssert.AreEqual(new[] { "list", "event", "list", "event" }, order, "The list goes out before the event that changes it.");
    }

    [TestMethod]
    public async Task What_the_machine_says_while_offline_goes_out_with_the_next_Running()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = BendTranslatorTest.Translator(Now);
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Current());
        await publisher.SaidAsync(translator.Translate(new OperatingStateObserved(Earlier, 3, "", "")));
        await publisher.LostAsync();
        var lost = client.Take();
        Assert.AreEqual("CommunicationFault", (string?)RecordingManagedMqttClient.Json(lost[^1])["value"]);

        await publisher.SaidAsync(translator.Translate(new OperatorMessageObserved(Earlier.AddSeconds(1), "1", "Hello")));
        Assert.IsEmpty(client.Take(), "A machine that is offline is not reported as running.");

        await publisher.ReachedAsync(translator.Translate(new OperatingStateObserved(Earlier.AddSeconds(2), 0, "", "")));
        var again = client.Take();
        var running = again.FindLastIndex(m => m.Topic == Root + "umati/Connection/State");
        var message = again.FindIndex(m => m.Topic == Root + "events/notifications");
        Assert.AreEqual("Running", (string?)RecordingManagedMqttClient.Json(again[running])["value"]);
        Assert.IsGreaterThan(running, message, "The held event follows Running.");
        Assert.AreEqual(Paths.NotificationEvent, (string?)RecordingManagedMqttClient.Json(again[message])["type"]);
    }

    [TestMethod]
    public void The_manifest_names_the_profile_Core_the_elements_the_signals_and_the_events()
    {
        var manifest = MqttPublisher.Manifest(BendTranslatorTest.Identity, TimeSpan.FromSeconds(10));

        Assert.AreEqual(MachineId, (string?)manifest["machineId"]);
        var elements = manifest["elements"]!.AsArray().OfType<JsonObject>().ToDictionary(e => (string)e["path"]!);
        Assert.AreEqual("source", (string?)elements[Paths.Status]["timestampSource"]);
        Assert.AreEqual("source", (string?)elements[Paths.ActiveAlerts]["timestampSource"]);
        Assert.AreEqual("source", (string?)elements[Paths.ActiveWorkMaster]["timestampSource"]);
        Assert.AreEqual("string", (string?)elements["x-trumpf-com.WorkMasterMonitoring.ActiveProgram"]["type"]);
        Assert.AreEqual("integer", (string?)elements["x-trumpf-com.Production.ProcessedParts"]["type"]);
        Assert.IsFalse((bool)elements["State.FeedOverride"]["available"]!, "What RCI does not give is not available.");
        Assert.IsFalse((bool)elements["OperationCounters.PowerOnDuration"]["available"]!);
        CollectionAssert.AreEquivalent(
            new[] { Paths.AlertRaised, Paths.AlertCleared, Paths.NotificationEvent },
            manifest["events"]!.AsArray().Select(e => (string)e!["path"]!).ToArray());
    }

    [TestMethod]
    public async Task Every_message_is_valid_after_the_schemas_of_the_model()
    {
        var manifest = MqttPublisher.Manifest(BendTranslatorTest.Identity, TimeSpan.FromSeconds(10));
        ModelSchemas.AssertManifestValid(manifest);

        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = BendTranslatorTest.Translator(Now);
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Current());
        foreach (var observation in new RciObservation[]
        {
            new OperatingStateObserved(Earlier, 1, "", ""),
            new OrderObserved(Earlier.AddSeconds(1), OrderEvent.Feedback, "PP-1", "FA-100", "BRACKET-12", "BRACKET_12.bend", 3, 3, 0),
            new PackageObserved(Earlier.AddSeconds(2), "PP-1", 2, 1),
            new OperatingStateObserved(Earlier.AddSeconds(3), -1, "4711", "Light curtain"),
            new OperatorMessageObserved(Earlier.AddSeconds(4), "12", "Change the tool"),
            new OperatingStateObserved(Earlier.AddSeconds(5), 0, "", ""),
        })
        {
            await publisher.ReachedAsync(translator.Translate(observation));
        }

        var messages = client.Take();

        ModelSchemas.AssertValuesValid(messages.Where(m => m.Retain), MachineId, manifest);
        var events = ModelSchemas.Schema("event.schema.json");
        foreach (var message in messages.Where(m => !m.Retain))
        {
            ModelSchemas.AssertValid(events, message.ConvertPayloadToString(), message.Topic);
        }
    }

    private static MqttPublisher Publisher(IManagedMqttClient client)
    {
        var config = new Config
        {
            SerialNumber = "B-01",
            MqttDestination = new MqttConfig(),
        };
        return new MqttPublisher(client, config.Identity, Options.Create(config), new FixedTime(Now), NullLogger<MqttPublisher>.Instance);
    }

    private static string? Value(IEnumerable<MqttApplicationMessage> messages, string path)
    {
        var message = messages.Last(m => m.Topic == Root + path);
        return (string?)RecordingManagedMqttClient.Json(message)["value"];
    }
}
