using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MQTTnet;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Mqtt.Extensions.Testing;

namespace Pleiades.Playground.Cutting.Adapter.Test;

/// <summary>What goes on the broker: the tree, the payloads and the events of the binding of machines.</summary>
[TestClass]
public sealed class MqttPublisherTest
{
    private const string MachineId = "trumpf_Laser2D_L-01";
    private const string Root = "machines/" + MachineId + "/";

    private static readonly DateTimeOffset Now = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public void TheMachineId_FollowsTheRuleOfTheBinding()
    {
        Assert.AreEqual(MachineId, CuttingTranslatorTest.Identity.MachineId);
    }

    [TestMethod]
    public async Task TheConnectSequence_ThenTheValuesOfTheMachine_ThenRunning()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, new FixedTime(Now));

        await publisher.StartAsync();
        await publisher.LostAsync();
        var start = client.Take();
        await publisher.ReachedAsync(translator.Connected());
        await publisher.ReachedAsync(translator.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "P", "")));
        var reached = client.Take();

        Assert.AreEqual(Root + "umati/Connection/State", start[0].Topic);
        Assert.AreEqual("Initializing", (string?)RecordingManagedMqttClient.Json(start[0])["value"]);
        Assert.AreEqual(Root + "umati/Manifest", start[1].Topic, "The manifest comes before the values.");
        Assert.AreEqual("TRUMPF", Value(start, "umati/Identification/Manufacturer"));
        Assert.AreEqual("L-01", Value(start, "umati/Identification/SerialNumber"));
        Assert.AreEqual("Laser2D", Value(start, "umati/Identification/Model"));
        Assert.AreEqual("https://www.trumpf.com", Value(start, "umati/Identification/ManufacturerUri"));
        Assert.AreEqual("https://www.trumpf.com/Laser2D/L-01", Value(start, "umati/Identification/ProductInstanceUri"));
        Assert.AreEqual("CommunicationFault", (string?)RecordingManagedMqttClient.Json(start[^1])["value"]);
        Assert.IsTrue(start.All(m => m.Retain && m.ContentType == MachineBinding.ContentType));

        var running = reached.FindIndex(m => m.Topic == Root + "umati/Connection/State");
        Assert.AreEqual("Running", (string?)RecordingManagedMqttClient.Json(reached[running])["value"], "Running once the values of the machine are out.");
        var after = reached[(running + 1)..];
        Assert.HasCount(2, after, "After Running only what changed: the state, and that no alert stands.");
        var status = RecordingManagedMqttClient.Json(after.Single(m => m.Topic == Root + "umati/State/Status"));
        Assert.AreEqual("Executing", (string?)status["value"]!["MachineryItemState"]);
        Assert.AreEqual("None", (string?)status["value"]!["MachineryOperationMode"]);
        var alerts = RecordingManagedMqttClient.Json(after.Single(m => m.Topic == Root + "umati/Notification/ActiveAlerts"));
        Assert.IsEmpty(alerts["value"]!.AsArray());
    }

    [TestMethod]
    public async Task AValueThatChangesTwiceInOneNotification_GoesOutTwice()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        await publisher.StartAsync();
        await publisher.ReachedAsync([new ValuePublication(Paths.ChannelState, "Active", Now)]);
        client.Take();

        await publisher.ReachedAsync(
        [
            new ValuePublication(Paths.ChannelState, "Interrupted", Now.AddSeconds(1)),
            new ValuePublication(Paths.ChannelState, "Reset", Now.AddSeconds(1).AddMilliseconds(1)),
        ]);

        var values = client.Take().Select(m => (string?)RecordingManagedMqttClient.Json(m)["value"]).ToList();
        CollectionAssert.AreEqual(new[] { "Interrupted", "Reset" }, values);
    }

    [TestMethod]
    public async Task AnAlert_IsACloudEventOnEventsNotifications_NumberedInItsGroup()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, new FixedTime(Now));
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Connected());
        client.Take();

        await publisher.ReachedAsync(translator.Translate(CuttingNotification.Create(CuttingNotifications.CurrentAlarms, "1", "4711", "Nozzle damaged", "")));
        await publisher.ReachedAsync(translator.Translate(CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "P", "")));
        var messages = client.Take();

        var events = messages.Where(m => m.Topic == Root + "events/notifications").ToList();
        Assert.HasCount(2, events);
        Assert.IsTrue(events.All(e => !e.Retain && e.ContentType == MqttPublisher.EventContentType));
        var raised = RecordingManagedMqttClient.Json(events[0]);
        var cleared = RecordingManagedMqttClient.Json(events[1]);
        Assert.AreEqual("1.0", (string?)raised["specversion"]);
        Assert.AreEqual("Notification.AlertRaised", (string?)raised["type"]);
        Assert.AreEqual("Notification.AlertCleared", (string?)cleared["type"]);
        Assert.AreEqual("https://www.trumpf.com/Laser2D/L-01", (string?)raised["source"]);
        Assert.EndsWith(".000000000001", (string?)raised["sequence"]);
        Assert.EndsWith(".000000000002", (string?)cleared["sequence"]);
        Assert.AreEqual("4711", (string?)raised["data"]!["ErrorCode"]);
        Assert.AreEqual((string?)raised["data"]!["Id"], (string?)cleared["data"]!["Id"]);

        var lists = messages.Where(m => m.Topic == Root + "umati/Notification/ActiveAlerts")
            .Select(m => RecordingManagedMqttClient.Json(m)["value"]!.AsArray().Count).ToList();
        CollectionAssert.AreEqual(new[] { 1, 0 }, lists, "The list follows the events.");
    }

    [TestMethod]
    public async Task WhatTheMachineSaysWhileLost_NeitherSaysRunningNorGoesOut_UntilItIsReachedAgain()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        await publisher.StartAsync();
        await publisher.ReachedAsync([new ValuePublication(Paths.ChannelState, "Active", Now)]);
        await publisher.LostAsync();
        client.Take();

        await publisher.SaidAsync([new ValuePublication(Paths.ChannelState, "Reset", Now.AddSeconds(1))]);
        Assert.IsEmpty(client.Take(), "A machine that does not answer is not reported as running.");

        await publisher.ReachedAsync([]);
        var again = client.Take();
        Assert.AreEqual("Reset", (string?)RecordingManagedMqttClient.Json(again.Single(m => m.Topic == Root + "umati/Channel/1/ChannelState"))["value"]);
        Assert.AreEqual("Running", (string?)RecordingManagedMqttClient.Json(again[^1])["value"]);
    }

    [TestMethod]
    public async Task AnAlertClearedWhileLost_GoesOutAfterTheValuesWithTheNextRunning()
    {
        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, new FixedTime(Now));
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Connected());
        await publisher.SaidAsync(translator.Translate(CuttingNotification.Create(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "")));
        await publisher.LostAsync();
        client.Take();

        await publisher.SaidAsync(translator.Disconnected(machineSwitchedOff: true));
        Assert.IsEmpty(client.Take(), "Neither the event nor the list goes out while the machine is lost.");

        await publisher.ReachedAsync(translator.Connected());
        var messages = client.Take();
        var list = messages.FindIndex(m => m.Topic == Root + "umati/Notification/ActiveAlerts");
        var running = messages.FindLastIndex(m => m.Topic == Root + "umati/Connection/State");
        var cleared = messages.FindIndex(m => m.Topic == Root + "events/notifications");
        Assert.IsTrue(list >= 0 && running > list && cleared > running, string.Join(", ", messages.Select(m => m.Topic)));
        Assert.AreEqual("Notification.AlertCleared", (string?)RecordingManagedMqttClient.Json(messages[cleared])["type"]);
    }

    [TestMethod]
    public async Task AnAlertWhileTheBrokerIsAway_GoesOutAfterTheConnectSequence()
    {
        using var client = new RecordingManagedMqttClient(connected: false);
        using var publisher = Publisher(client);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, new FixedTime(Now));
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Connected());
        await publisher.SaidAsync(translator.Translate(CuttingNotification.Create(CuttingNotifications.CurrentAlarms, "1", "4711", "Text", "")));
        Assert.IsEmpty(client.Take());

        await client.ConnectAsync();
        var messages = client.Take();

        var first = messages.FindIndex(m => m.Topic == Root + "events/notifications");
        var manifest = messages.FindIndex(m => m.Topic == Root + "umati/Manifest");
        Assert.IsGreaterThan(manifest, first, "The event follows the manifest.");
    }

    [TestMethod]
    public void TheManifest_NamesTheProfileCore_TheElementsAndTheEvents()
    {
        var manifest = MqttPublisher.Manifest(CuttingTranslatorTest.Identity, TimeSpan.FromSeconds(10));

        Assert.AreEqual(MachineId, (string?)manifest["machineId"]);
        var elements = manifest["elements"]!.AsArray().OfType<JsonObject>().ToDictionary(e => (string)e["path"]!);
        Assert.AreEqual("source", (string?)elements[Paths.Status]["timestampSource"]);
        Assert.IsTrue(elements.ContainsKey(Paths.ChannelState));
        Assert.AreEqual("source", (string?)elements[Paths.ActiveWorkMaster]["timestampSource"]);
        Assert.AreEqual("string", (string?)elements["x-trumpf-com.WorkMasterMonitoring.ActiveProgram"]["type"]);
        Assert.IsFalse((bool)elements["Identification.YearOfConstruction"]["available"]!, "What the protocol does not give is not available.");
        Assert.IsFalse((bool)elements["OperationCounters.PowerOnDuration"]["available"]!);
        CollectionAssert.AreEquivalent(
            new[] { Paths.AlertRaised, Paths.AlertCleared },
            manifest["events"]!.AsArray().Select(e => (string)e!["path"]!).ToArray());
    }

    [TestMethod]
    public async Task EveryMessage_IsValidAfterTheSchemasOfTheModel()
    {
        var manifest = MqttPublisher.Manifest(CuttingTranslatorTest.Identity, TimeSpan.FromSeconds(10));
        ModelSchemas.AssertManifestValid(manifest);

        using var client = new RecordingManagedMqttClient();
        using var publisher = Publisher(client);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, new FixedTime(Now));
        await publisher.StartAsync();
        await publisher.ReachedAsync(translator.Connected());
        foreach (var notification in new[]
        {
            CuttingNotification.Create(CuttingNotifications.Feedrate, "1", "85", ""),
            CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "", "", "0"),
            CuttingNotification.Create(CuttingNotifications.MachineStopped, "1", "PROG_A", "", "1"),
            CuttingNotification.Create(CuttingNotifications.CurrentAlarms, "1", "4711", "Nozzle damaged", ""),
            CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG_A", ""),
            CuttingNotification.Create(CuttingNotifications.EndNcp, "1", "PROG_A", "", "", "1", ""),
        })
        {
            await publisher.ReachedAsync(translator.Translate(notification));
        }

        await publisher.ReachedAsync(translator.Disconnected(machineSwitchedOff: true));
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
            SerialNumber = "L-01",
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
