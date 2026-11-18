using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Mqtt.Extensions.Testing;

namespace Pleiades.Playground.Mqtt.Extensions.Test;

/// <summary>
/// What an adapter of a real device puts on the broker after the binding of machines: the rule of the machine id,
/// the envelope, retained values with QoS 1, the manifest before the values and the states of the adapter.
/// </summary>
[TestClass]
public sealed class MachinePublisherTest
{
    private static readonly MachineIdentity Identity = new("Example Works", "https://www.example-works.example", "EW-1", "SN-7");
    private static readonly DateTimeOffset Start = new(2026, 11, 18, 9, 0, 0, TimeSpan.Zero);
    private const string Machine = "machines/example-works_EW-1_SN-7/";

    [TestMethod]
    [DataRow("https://www.alcyone-machines.example", "AX-400", "P-04", "alcyone-machines_AX-400_P-04")]
    [DataRow("https://machines.example.co.uk", "AX-400", "P-04", "machines-example-co_AX-400_P-04")]
    [DataRow("https://müller-maschinen.de", "Schleifer 5/2", "SN 0815#a", "mueller-maschinen_Schleifer-5-2_SN-0815-a")]
    [DataRow("https://ultimaker.com", "UM3", "UM3-01", "ultimaker_UM3_UM3-01")]
    [DataRow("https://www.trumpf.com", "JuiceBar", "JUICEBAR-01", "trumpf_JuiceBar_JUICEBAR-01")]
    public void MachineId_FollowsTheRuleOfTheBinding(string manufacturerUri, string model, string serialNumber, string expected)
    {
        Assert.AreEqual(expected, MachineBinding.MachineId(manufacturerUri, model, serialNumber));
    }

    [TestMethod]
    public void Identity_FormsTheProductInstanceUriAndThePrefixOfItsSignals()
    {
        Assert.AreEqual("https://www.example-works.example/EW-1/SN-7", Identity.EffectiveProductInstanceUri);
        Assert.AreEqual("x-example-works-example", Identity.ExtensionPrefix);
        Assert.AreEqual("urn:example:7", (Identity with { ProductInstanceUri = "urn:example:7" }).EffectiveProductInstanceUri);
        Assert.AreEqual(Machine + "oem/Spindle/1/Temperature", MachineBinding.Topic(Identity.MachineId, Identity.Signal("Spindle.1.Temperature")));
        Assert.AreEqual(Machine + "umati/State/Status", MachineBinding.Topic(Identity.MachineId, "State.Status"));
    }

    [TestMethod]
    public void Manifest_NamesTheProfileCoreWhole_AndWhatTheMachineLacksAsUnavailable()
    {
        var manifest = Manifest();
        Assert.AreEqual("0.17.1", manifest["modelVersion"]!.GetValue<string>());
        Assert.AreEqual("example-works_EW-1_SN-7", manifest["machineId"]!.GetValue<string>());
        Assert.AreEqual(Identity.EffectiveProductInstanceUri, manifest["machine"]!["ProductInstanceUri"]!.GetValue<string>());
        CollectionAssert.AreEqual(new[] { "Core" }, manifest["profiles"]!.AsArray().Select(p => p!.GetValue<string>()).ToArray());
        CollectionAssert.AreEquivalent(
            new[] { "Identification.ProductCode", "Identification.YearOfConstruction", "State.FeedOverride", "Notification.ActiveAlerts", "OperationCounters.PowerOnDuration" },
            MachineManifest.Unavailable(manifest).ToArray());
        var signal = manifest["elements"]!.AsArray().Single(e => e!["path"]!.GetValue<string>() == "x-example-works-example.Spindle.1.Temperature")!;
        Assert.AreEqual("number", signal["type"]!.GetValue<string>());
        Assert.AreEqual("degreeCelsius", signal["unit"]!["name"]!.GetValue<string>());
        ModelSchemas.AssertManifestValid(manifest);
    }

    [TestMethod]
    public void Manifest_TheSchemaRefusesItWithoutAnElementOfCore()
    {
        var manifest = Manifest();
        manifest.Remove("machineId");
        var schema = ModelSchemas.Schema("manifest.schema.json");
        var elements = manifest["elements"]!.AsArray();
        for (var i = 0; i < elements.Count; i++)
        {
            var path = elements[i]!["path"]!.GetValue<string>();
            if (path.StartsWith("x-", StringComparison.Ordinal))
            {
                continue;
            }
            var without = manifest.DeepClone().AsObject();
            without["elements"]!.AsArray().RemoveAt(i);
            Assert.IsFalse(ModelSchemas.IsValid(schema, without.ToJsonString()), $"the manifest without {path}");
        }
    }

    [TestMethod]
    public async Task FirstConnect_SaysInitializing_ThenTheManifest_TheIdentification_AndWhatTheMachineLacks()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);

        await publisher.AttachAsync();

        var messages = client.Take();
        Assert.IsTrue(messages.All(m => m.Retain && m.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtLeastOnce && m.ContentType == "application/json"));
        Assert.AreEqual(Machine + "umati/Connection/State", messages[0].Topic);
        Assert.AreEqual("Initializing", Value(messages[0]));
        Assert.AreEqual(Machine + "umati/Manifest", messages[1].Topic);
        Assert.AreEqual("SN-7", Value(messages.Single(m => m.Topic == Machine + "umati/Identification/SerialNumber")));
        Assert.AreEqual("https://www.example-works.example/EW-1/SN-7", Value(messages.Single(m => m.Topic == Machine + "umati/Identification/ProductInstanceUri")));
        var feed = RecordingManagedMqttClient.Json(messages.Single(m => m.Topic == Machine + "umati/State/FeedOverride"));
        Assert.IsNull(feed["value"], "what the machine lacks is null");
        // The device has not answered yet: the state stays Initializing.
        Assert.AreEqual(1, messages.Count(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)));
        ModelSchemas.AssertValuesValid(messages, publisher.MachineId, Manifest());
    }

    [TestMethod]
    public async Task TheDeviceAnswers_EveryValueThenRunning_ThenOnlyWhatChanges_AndWhatItNoLongerSaysIsNull()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        client.Take();

        await publisher.ReachedAsync(Values(21.5, "Executing", job: "J-1"), time.GetUtcNow());
        var first = client.Take();
        CollectionAssert.AreEqual(new[] { "umati/State/Status", "oem/Spindle/1/Temperature", "oem/Job", "umati/Connection/State" },
            first.Select(m => m.Topic[Machine.Length..]).ToArray());
        Assert.AreEqual("Running", Value(first[^1]));
        var status = RecordingManagedMqttClient.Json(first[0]);
        Assert.AreEqual("Executing", status["value"]!["MachineryItemState"]!.GetValue<string>());
        Assert.IsNull(status["unit"]);
        var temperature = RecordingManagedMqttClient.Json(first[1]);
        Assert.AreEqual(21.5, temperature["value"]!.GetValue<double>());
        Assert.AreEqual("degreeCelsius", temperature["unit"]!.GetValue<string>());
        Assert.AreEqual("2026-11-18T09:00:00.000Z", temperature["timestamp"]!.GetValue<string>());

        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.ReachedAsync(Values(21.5, "Executing", job: "J-1"), time.GetUtcNow());
        Assert.IsEmpty(client.Take(), "what says the same again does not go out");

        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.ReachedAsync(Values(22.0, "Executing", job: null), time.GetUtcNow());
        var changed = client.Take();
        CollectionAssert.AreEquivalent(new[] { "oem/Spindle/1/Temperature", "oem/Job" }, changed.Select(m => m.Topic[Machine.Length..]).ToArray());
        Assert.IsNull(RecordingManagedMqttClient.Json(changed.Single(m => m.Topic.EndsWith("/Job", StringComparison.Ordinal)))["value"]);

        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.ReachedAsync(Values(22.0, "Executing", job: null), time.GetUtcNow());
        Assert.IsEmpty(client.Take(), "a value that is gone goes out as null once");
        ModelSchemas.AssertValuesValid(first.Concat(changed), publisher.MachineId, Manifest());
    }

    [TestMethod]
    public async Task TheDeviceIsLost_CommunicationFaultOnce_ValuesStand_AndWhenItAnswersAgainEverythingThenRunning()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        client.Take();

        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.LostAsync(time.GetUtcNow());
        await publisher.LostAsync(time.GetUtcNow());
        await publisher.HeartbeatAsync(time.GetUtcNow());
        var lost = client.Take();
        Assert.HasCount(2, lost);
        Assert.AreEqual("CommunicationFault", Value(lost[0]));
        Assert.AreEqual(Machine + "umati/Connection/Heartbeat", lost[1].Topic);
        var heartbeat = RecordingManagedMqttClient.Json(lost[1]);
        Assert.AreEqual(1, heartbeat["value"]!.GetValue<long>());
        Assert.IsNull(heartbeat["unit"], "the catalogue gives the heartbeat no unit");
        Assert.IsFalse(publisher.Reachable);

        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        var back = client.Take();
        Assert.HasCount(4, back, "every value anew, though unchanged, then Running");
        Assert.AreEqual("Running", Value(back[^1]));
        Assert.IsTrue(publisher.Reachable);
    }

    [TestMethod]
    public async Task AReconnect_SendsTheManifestAndEveryValueAgain_ThenTheState_WithoutASecondInitializing()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        client.Disconnect();
        time.Advance(TimeSpan.FromSeconds(2));
        await publisher.ReachedAsync(Values(23.0, "NotExecuting", "J-1"), time.GetUtcNow());
        await publisher.HeartbeatAsync(time.GetUtcNow());
        client.Take();

        await client.ConnectAsync();
        var again = client.Take();
        Assert.AreEqual(Machine + "umati/Manifest", again[0].Topic);
        Assert.IsFalse(again.Any(m => Value(m) as string == "Initializing"));
        Assert.AreEqual(23.0, RecordingManagedMqttClient.Json(again.Single(m => m.Topic.EndsWith("/Temperature", StringComparison.Ordinal)))["value"]!.GetValue<double>());
        Assert.AreEqual("Running", Value(again[^1]));
        Assert.AreEqual(Machine + "umati/Connection/State", again[^1].Topic);
    }

    [TestMethod]
    public async Task TheStatesFollowEachOther_AMillisecondApartAtLeast_AndShutdownIsTheLast()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        await publisher.LostAsync(time.GetUtcNow());
        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        await publisher.ShutdownAsync(time.GetUtcNow(), TimeSpan.Zero);

        var states = client.Take().Where(m => m.Topic.EndsWith("/Connection/State", StringComparison.Ordinal)).Select(RecordingManagedMqttClient.Json).ToList();
        CollectionAssert.AreEqual(new[] { "Initializing", "CommunicationFault", "Running", "Shutdown" }, states.Select(s => s["value"]!.GetValue<string>()).ToArray());
        CollectionAssert.AreEqual(new[] { "2026-11-18T09:00:00.000Z", "2026-11-18T09:00:00.001Z", "2026-11-18T09:00:00.002Z", "2026-11-18T09:00:00.003Z" },
            states.Select(s => s["timestamp"]!.GetValue<string>()).ToArray());
    }

    [TestMethod]
    public async Task ANewManifest_GoesOutBeforeTheValuesThatNeedIt_AndOnlyWhenItChanged()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        client.Take();
        await publisher.UpdateManifestAsync(Manifest());
        Assert.IsEmpty(client.Take());
        var grown = Manifest(extra: "Spindle.2.Temperature");
        await publisher.UpdateManifestAsync(grown);
        var sent = client.Take().Single();
        Assert.AreEqual(Machine + "umati/Manifest", sent.Topic);
        Assert.IsTrue(JsonNode.DeepEquals(grown, RecordingManagedMqttClient.Json(sent)));
    }

    [TestMethod]
    public async Task NoHeartbeatGoesOut_BeforeTheConnectSequenceOfTheConnection()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);

        // Connected, but the handler of the connect has not run yet.
        await publisher.HeartbeatAsync(time.GetUtcNow());
        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        Assert.IsEmpty(client.Take());

        await publisher.AttachAsync();
        await publisher.HeartbeatAsync(time.GetUtcNow());
        var messages = client.Take();
        Assert.AreEqual("Initializing", Value(messages[0]));
        Assert.AreEqual(Machine + "umati/Manifest", messages[1].Topic);
        Assert.AreEqual("Running", Value(messages[^2]));
        Assert.AreEqual(Machine + "umati/Connection/Heartbeat", messages[^1].Topic);
    }

    [TestMethod]
    public async Task AFailedConnectSequence_IsTriedAgainWithTheNextCall_WithoutASecondInitializing()
    {
        using var client = new RecordingManagedMqttClient { FailAt = 3 };
        var time = new ManualTimeProvider(Start);
        using var publisher = Publisher(client, time);

        await publisher.AttachAsync();
        Assert.HasCount(2, client.Take(), "Initializing and the manifest, then the queue refused");

        await publisher.HeartbeatAsync(time.GetUtcNow());
        var again = client.Take();
        Assert.IsFalse(again.Any(m => Value(m) as string == "Initializing"));
        Assert.AreEqual(Machine + "umati/Manifest", again[0].Topic);
        Assert.IsTrue(again.Any(m => m.Topic == Machine + "umati/Identification/SerialNumber"));
        Assert.IsFalse(again.Any(m => m.Topic.EndsWith("/Heartbeat", StringComparison.Ordinal)), "the heartbeat waits for the next round");

        await publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        Assert.AreEqual("Running", Value(client.Take()[^1]));
        await publisher.HeartbeatAsync(time.GetUtcNow());
        Assert.AreEqual(Machine + "umati/Connection/Heartbeat", client.Take().Single().Topic);
    }

    [TestMethod]
    public async Task AConnectHandlerInFlight_EndsQuietly_WhenThePublisherIsDisposed()
    {
        using var client = new RecordingManagedMqttClient();
        var time = new ManualTimeProvider(Start);
        var publisher = Publisher(client, time);
        await publisher.AttachAsync();
        client.Take();

        // A value holds the gate while the queue waits; a connect comes meanwhile.
        client.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var reached = publisher.ReachedAsync(Values(21.5, "Executing", "J-1"), time.GetUtcNow());
        var connect = client.ConnectAsync();
        Assert.IsFalse(connect.IsCompleted);

        publisher.Dispose();
        await connect.WaitAsync(TimeSpan.FromSeconds(5));
        client.Hold.SetResult();
        await reached.WaitAsync(TimeSpan.FromSeconds(5));
        await publisher.HeartbeatAsync(time.GetUtcNow());
        Assert.IsFalse(client.Take().Any(m => m.Topic.EndsWith("/Manifest", StringComparison.Ordinal)), "the disposed publisher sends no sequence");
    }

    [TestMethod]
    public void LastWill_IsCommunicationFault_RetainedWithQos1_OnConnectionState()
    {
        var options = ManagedMqttClientOptions.From(new MqttConfig { ConnectionString = "mqtt://localhost:1883" },
            builder => builder.WithMachineLastWill(Identity.MachineId, Start)).ClientOptions;
        Assert.AreEqual(Machine + "umati/Connection/State", options.WillTopic);
        Assert.IsTrue(options.WillRetain);
        Assert.AreEqual(MqttQualityOfServiceLevel.AtLeastOnce, options.WillQualityOfServiceLevel);
        Assert.AreEqual("application/json", options.WillContentType);
        var will = JsonNode.Parse(Encoding.UTF8.GetString(options.WillPayload))!;
        Assert.AreEqual("CommunicationFault", will["value"]!.GetValue<string>());
        Assert.AreEqual("2026-11-18T09:00:00.000Z", will["timestamp"]!.GetValue<string>());
        Assert.IsNull(ManagedMqttClientOptions.From(new MqttConfig { ConnectionString = "mqtt://localhost:1883" }).ClientOptions.WillTopic,
            "without the hook a client has no last will, as before");
    }

    private static MachinePublisher Publisher(RecordingManagedMqttClient client, ManualTimeProvider time)
        => new(client, Identity, Manifest(), time, NullLogger.Instance);

    private static JsonObject Manifest(string? extra = null)
    {
        List<MachineElement> elements =
        [
            new(MachineManifest.Status),
            new(Identity.Signal("Spindle.1.Temperature"), MachineElement.Adapter, MachineSignal.Number(MachineUnit.DegreeCelsius, "Temperature of spindle 1")),
            new(Identity.Signal("Job"), MachineElement.Adapter, MachineSignal.Text("The job")),
        ];
        if (extra is not null)
        {
            elements.Add(new(Identity.Signal(extra), MachineElement.Adapter, MachineSignal.Number(MachineUnit.DegreeCelsius, "Another temperature")));
        }
        return MachineManifest.Build(Identity, TimeSpan.FromSeconds(10), elements);
    }

    private static List<MachineValue> Values(double temperature, string state, string? job)
    {
        var at = Start;
        List<MachineValue> values =
        [
            new(MachineManifest.Status, new JsonObject { ["MachineryItemState"] = state, ["MachineryOperationMode"] = "None" }, at),
            new(Identity.Signal("Spindle.1.Temperature"), JsonValue.Create(temperature), at, MachineUnit.DegreeCelsius.Name),
        ];
        if (job is not null)
        {
            values.Add(new(Identity.Signal("Job"), JsonValue.Create(job), at));
        }
        return values;
    }

    private static object? Value(MqttApplicationMessage message)
    {
        var value = RecordingManagedMqttClient.Json(message)["value"];
        return value is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.String ? (object)v.GetValue<string>() : value;
    }
}
