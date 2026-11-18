using System.Text;
using System.Text.Json;

namespace Pleiades.Playground.Nats.Bridge.Test;

/// <summary>
/// A message of the MQTT binding becomes a CloudEvent on a NATS subject, as contracts/nats describes it.
/// </summary>
[TestClass]
public sealed class CloudEventMapperTest
{
    private const string Prefix = "local.pleiades";
    private const string MachineId = "alcyone-machines_AX-400_P-04";
    private const string Event = """
        { "specversion": "1.0", "id": "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60", "source": "https://www.alcyone-machines.example/AX-400/P-04",
          "type": "Notification.AlertRaised", "time": "2026-11-17T09:00:00.000Z", "sequence": "20261117T060000Z.000000000001",
          "data": { "Id": "a-1", "Severity": "OffSpec" } }
        """;

    private static MqttInput Input(string topic, string payload, string? contentType = "application/json", bool retained = false) =>
        new(topic, Encoding.UTF8.GetBytes(payload), contentType, retained);

    private static JsonElement Json(NatsCloudEvent cloudEvent) => JsonDocument.Parse(cloudEvent.Body).RootElement;

    [TestMethod]
    public void AValue_IsWrapped_WithItsEnvelopeAsData()
    {
        const string envelope = """{ "timestamp": "2026-11-17T09:15:00.120Z", "value": 12034.5, "unit": "watt" }""";

        var result = CloudEventMapper.Map(Input($"machines/{MachineId}/umati/Monitoring/Power/ActivePower", envelope, retained: true), Prefix, out var reason);

        Assert.IsNotNull(result, reason);
        Assert.AreEqual($"local.pleiades.machines.{MachineId}.umati.Monitoring.Power.ActivePower", result.Subject);
        var json = Json(result);
        Assert.AreEqual("1.0", json.GetProperty("specversion").GetString());
        Assert.AreEqual(result.Id, json.GetProperty("id").GetString());
        Assert.AreEqual($"/machines/{MachineId}", json.GetProperty("source").GetString());
        Assert.AreEqual(CloudEventMapper.MachineValueType, json.GetProperty("type").GetString());
        Assert.AreEqual("umati/Monitoring/Power/ActivePower", json.GetProperty("subject").GetString());
        Assert.AreEqual("2026-11-17T09:15:00.120Z", json.GetProperty("time").GetString());
        Assert.AreEqual("application/json", json.GetProperty("datacontenttype").GetString());
        Assert.AreEqual(MachineId, json.GetProperty("machineid").GetString());
        Assert.AreEqual($"machines/{MachineId}/umati/Monitoring/Power/ActivePower", json.GetProperty("mqtttopic").GetString());
        Assert.IsTrue(json.GetProperty("mqttretained").GetBoolean());
        Assert.AreEqual(12034.5, json.GetProperty("data").GetProperty("value").GetDouble());
        Assert.AreEqual("watt", json.GetProperty("data").GetProperty("unit").GetString(), "the unit as it came");
    }

    [TestMethod]
    public void ASnapshot_KeepsItsObject()
    {
        const string envelope = """{ "timestamp": "2026-11-17T09:15:02.123Z", "value": { "MachineryItemState": "Executing" } }""";

        var result = CloudEventMapper.Map(Input($"machines/{MachineId}/umati/State/Status", envelope), Prefix, out _);

        Assert.IsNotNull(result);
        Assert.AreEqual("Executing", Json(result).GetProperty("data").GetProperty("value").GetProperty("MachineryItemState").GetString());
    }

    [TestMethod]
    public void TheManifest_HasATypeOfItsOwn_AndTheTimeOfReading()
    {
        var before = DateTimeOffset.UtcNow.AddSeconds(-1);

        var result = CloudEventMapper.Map(Input($"machines/{MachineId}/umati/Manifest", """{ "machineId": "x" }"""), Prefix, out _);

        Assert.IsNotNull(result);
        var json = Json(result);
        Assert.AreEqual(CloudEventMapper.MachineManifestType, json.GetProperty("type").GetString());
        Assert.AreEqual("umati/Manifest", json.GetProperty("subject").GetString());
        Assert.IsGreaterThanOrEqualTo(before, DateTimeOffset.Parse(json.GetProperty("time").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
    }

    [TestMethod]
    public void ASignalOfTheManufacturer_IsAValueOfTheMachine()
    {
        var result = CloudEventMapper.Map(Input($"machines/{MachineId}/oem/Spindle/1/BearingTemperature",
            """{ "timestamp": "2026-11-17T09:15:00Z", "value": 41.2, "unit": "degreeCelsius" }"""), Prefix, out _);

        Assert.IsNotNull(result);
        Assert.AreEqual(CloudEventMapper.MachineValueType, Json(result).GetProperty("type").GetString());
        Assert.AreEqual("oem/Spindle/1/BearingTemperature", Json(result).GetProperty("subject").GetString());
    }

    [TestMethod]
    public void AValueOfAPlace_NamesThePlaceAndItsSource()
    {
        var result = CloudEventMapper.Map(Input("sites/demo/weather/AirTemperature",
            """{ "timestamp": "2026-11-16T09:10:00Z", "value": 10.7, "unit": "degreeCelsius" }"""), Prefix, out _);

        Assert.IsNotNull(result);
        Assert.AreEqual("local.pleiades.sites.demo.weather.AirTemperature", result.Subject);
        var json = Json(result);
        Assert.AreEqual(CloudEventMapper.SiteValueType, json.GetProperty("type").GetString());
        Assert.AreEqual("/sites/demo/weather", json.GetProperty("source").GetString());
        Assert.AreEqual("AirTemperature", json.GetProperty("subject").GetString());
        Assert.AreEqual("demo", json.GetProperty("siteid").GetString());
        Assert.AreEqual("2026-11-16T09:10:00.000Z", json.GetProperty("time").GetString());
    }

    [TestMethod]
    [DataRow("application/cloudevents+json; charset=utf-8")]
    [DataRow("Application/CloudEvents+JSON")]
    public void AnEvent_GoesOnByteForByte(string contentType)
    {
        var input = Input($"machines/{MachineId}/events/notifications", Event, contentType);

        var result = CloudEventMapper.Map(input, Prefix, out _);

        Assert.IsNotNull(result);
        Assert.AreEqual($"local.pleiades.machines.{MachineId}.events.notifications", result.Subject);
        Assert.AreEqual("0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60", result.Id);
        Assert.AreEqual(CloudEventMapper.Hash("https://www.alcyone-machines.example/AX-400/P-04",
            Encoding.UTF8.GetBytes("0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60")), result.MessageId, "the message id is made of source and id");
        Assert.AreEqual("Notification.AlertRaised", result.Type);
        CollectionAssert.AreEqual(input.Payload.ToArray(), result.Body.ToArray());
    }

    [TestMethod]
    [DataRow(null, Event)]
    [DataRow("application/json", Event)]
    [DataRow("application/cloudevents+json", """{ "specversion": "1.0", "source": "s", "type": "t" }""")]
    [DataRow("application/cloudevents+json", """{ "specversion": "0.3", "id": "1", "source": "s", "type": "t" }""")]
    [DataRow("application/cloudevents+json", """{ "specversion": "1.0", "id": "", "source": "s", "type": "t" }""")]
    public void AnEventThatIsNoCloudEvent_GoesNowhere(string? contentType, string payload)
    {
        Assert.IsNull(CloudEventMapper.Map(Input($"machines/{MachineId}/events/jobs", payload, contentType), Prefix, out var reason));
        Assert.IsNotNull(reason);
    }

    [TestMethod]
    [DataRow("machines/a.b/umati/State/Status")]
    [DataRow("machines/a b/umati/State/Status")]
    [DataRow("machines/x/umati/State/*")]
    [DataRow("machines/x/umati/State/>")]
    [DataRow("machines//umati/State/Status")]
    [DataRow("sites/demo/weather/")]
    public void ALevelThatIsNoNatsToken_GoesNowhere(string topic)
    {
        Assert.IsNull(CloudEventMapper.Map(Input(topic, """{ "value": 1 }"""), Prefix, out var reason));
        Assert.Contains("NATS token", reason!);
    }

    [TestMethod]
    [DataRow("other/x/y/z")]
    [DataRow("machines/x/umati")]
    [DataRow("machines/x/vendor/A")]
    [DataRow("machines/x/events/jobs/more")]
    [DataRow("sites/demo/weather")]
    public void ATopicOutsideTheBinding_GoesNowhere(string topic)
    {
        Assert.IsNull(CloudEventMapper.Map(Input(topic, """{ "value": 1 }""", "application/cloudevents+json"), Prefix, out var reason));
        Assert.IsNotNull(reason);
    }

    [TestMethod]
    [DataRow("not json")]
    [DataRow("[1, 2]")]
    [DataRow("42")]
    public void APayloadThatIsNoJsonObject_GoesNowhere(string payload)
    {
        Assert.IsNull(CloudEventMapper.Map(Input($"machines/{MachineId}/umati/State/Status", payload), Prefix, out var reason));
        Assert.IsNotNull(reason);
    }

    [TestMethod]
    public void TheSameMessage_HasTheSameId_AnotherOneAnother()
    {
        const string topic = $"machines/{MachineId}/umati/State/Status";
        const string first = """{ "timestamp": "2026-11-17T09:15:00Z", "value": "A" }""";
        const string second = """{ "timestamp": "2026-11-17T09:15:01Z", "value": "A" }""";

        var a = CloudEventMapper.Map(Input(topic, first, retained: false), Prefix, out _)!;
        var again = CloudEventMapper.Map(Input(topic, first, retained: true), Prefix, out _)!;
        var later = CloudEventMapper.Map(Input(topic, second), Prefix, out _)!;
        var elsewhere = CloudEventMapper.Map(Input($"machines/{MachineId}/umati/State/Other", first), Prefix, out _)!;

        Assert.AreEqual(a.Id, again.Id, "a retained value handed over again keeps its id");
        Assert.AreNotEqual(a.Id, later.Id);
        Assert.AreNotEqual(a.Id, elsewhere.Id);
        Assert.AreEqual(32, a.Id.Length);
        Assert.AreEqual(a.Id, a.MessageId, "a wrapped value has one id for both");
    }

    [TestMethod]
    [DataRow("local.pleiades", true)]
    [DataRow("pleiades", true)]
    [DataRow("", false)]
    [DataRow("local.", false)]
    [DataRow(".local", false)]
    [DataRow("local.*", false)]
    [DataRow("local.>", false)]
    [DataRow("local pleiades", false)]
    public void APrefix_IsTokensJoinedByDots(string prefix, bool valid)
    {
        Assert.AreEqual(valid, CloudEventMapper.IsValidPrefix(prefix));
    }

    [TestMethod]
    public void TheSameEventIdOfTwoSources_IsTwoMessages()
    {
        var first = CloudEventMapper.Map(Input($"machines/{MachineId}/events/jobs", Event.Replace("AX-400/P-04", "AX-400/P-05", StringComparison.Ordinal),
            "application/cloudevents+json"), Prefix, out _)!;
        var second = CloudEventMapper.Map(Input($"machines/{MachineId}/events/jobs", Event, "application/cloudevents+json"), Prefix, out _)!;

        Assert.AreEqual(first.Id, second.Id);
        Assert.AreNotEqual(first.MessageId, second.MessageId);
    }

    [TestMethod]
    public void ARetainedEvent_GoesOnAsItCame()
    {
        var input = Input($"machines/{MachineId}/events/jobs", Event, "application/cloudevents+json", retained: true);

        var result = CloudEventMapper.Map(input, Prefix, out _);

        Assert.IsNotNull(result);
        CollectionAssert.AreEqual(input.Payload.ToArray(), result.Body.ToArray());
    }

    [TestMethod]
    [DataRow("2026-11-17T09:15:00.120Z", "2026-11-17T09:15:00.120Z")]
    [DataRow("2026-11-17T09:15:00Z", "2026-11-17T09:15:00.000Z")]
    [DataRow("2026-11-17T09:15:00.1234567Z", "2026-11-17T09:15:00.1234567Z")]
    [DataRow("2026-11-17T10:15:00.5+01:00", "2026-11-17T09:15:00.500Z")]
    public void TheTime_IsTheTimestampInUtc_WithoutLosingPrecision(string timestamp, string expected)
    {
        var result = CloudEventMapper.Map(Input($"machines/{MachineId}/umati/State/Status",
            $$"""{ "timestamp": "{{timestamp}}", "value": 1 }"""), Prefix, out _);

        Assert.AreEqual(expected, Json(result!).GetProperty("time").GetString());
    }
}
