using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>A message of the MQTT broker, as the bridge needs it.</summary>
/// <param name="Topic">The MQTT topic.</param>
/// <param name="Payload">The payload, UTF-8.</param>
/// <param name="ContentType">The MQTT 5 content type, or null.</param>
/// <param name="Retained">Whether the broker handed it over as a retained message.</param>
internal sealed record MqttInput(string Topic, ReadOnlyMemory<byte> Payload, string? ContentType, bool Retained);

/// <summary>A CloudEvent ready for NATS.</summary>
/// <param name="Subject">The NATS subject.</param>
/// <param name="Id">The <c>id</c> of the CloudEvent.</param>
/// <param name="MessageId">The <c>Nats-Msg-Id</c>, by which JetStream drops a duplicate: unique by <c>source</c> and <c>id</c>.</param>
/// <param name="Type">The <c>type</c> of the CloudEvent.</param>
/// <param name="Body">The CloudEvent in the JSON format, structured mode, UTF-8.</param>
internal sealed record NatsCloudEvent(string Subject, string Id, string MessageId, string Type, ReadOnlyMemory<byte> Body);

/// <summary>
/// Turns a message of the MQTT binding (<c>contracts/mqtt</c>) into a CloudEvent on a NATS subject, as
/// <c>contracts/nats</c> describes it.
/// <list type="bullet">
/// <item>An event (<c>machines/{MachineId}/events/{group}</c>) is a CloudEvent already: it goes on unchanged.</item>
/// <item>A value, the manifest or a value of a place is wrapped: its envelope becomes the <c>data</c> of a CloudEvent
/// of the bridge.</item>
/// </list>
/// The subject is the prefix and the levels of the topic, every <c>/</c> a <c>.</c>.
/// </summary>
internal static class CloudEventMapper
{
    /// <summary>The content type of a CloudEvent in structured mode, on MQTT and on NATS.</summary>
    public const string CloudEventContentType = "application/cloudevents+json";

    /// <summary>The <c>Content-Type</c> header of every NATS message of the bridge.</summary>
    public const string NatsContentType = CloudEventContentType + "; charset=utf-8";

    /// <summary>The type of a value below <c>machines/{MachineId}/umati/</c> or <c>…/oem/</c>.</summary>
    public const string MachineValueType = "pleiades.playground.machine.value.v1";

    /// <summary>The type of the manifest, <c>machines/{MachineId}/umati/Manifest</c>.</summary>
    public const string MachineManifestType = "pleiades.playground.machine.manifest.v1";

    /// <summary>The type of a value below <c>sites/{SiteId}/{Source}/</c>.</summary>
    public const string SiteValueType = "pleiades.playground.site.value.v1";

    /// <summary>
    /// Maps a message. Returns null and a reason when the message is not one the bridge sends on.
    /// </summary>
    public static NatsCloudEvent? Map(MqttInput input, string subjectPrefix, out string? reason)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(subjectPrefix);

        var levels = input.Topic.Split('/');
        if (levels.FirstOrDefault(l => !IsToken(l)) is { } bad)
        {
            reason = $"the level '{bad}' is no NATS token";
            return null;
        }
        var subject = subjectPrefix + "." + string.Join('.', levels);

        JsonElement root;
        try
        {
            using var document = JsonDocument.Parse(input.Payload);
            root = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            reason = "the payload is no JSON";
            return null;
        }
        if (root.ValueKind != JsonValueKind.Object)
        {
            reason = "the payload is no JSON object";
            return null;
        }

        switch (levels)
        {
            case ["machines", var machineId, "events", _]:
                return PassEvent(input, subject, machineId, root, out reason);

            case ["machines", var machineId, "umati", "Manifest"]:
                reason = null;
                return Wrap(input, subject, MachineManifestType, $"/machines/{machineId}", "umati/Manifest", root,
                    ("machineid", machineId));

            case ["machines", var machineId, "umati" or "oem", _, ..]:
                reason = null;
                return Wrap(input, subject, MachineValueType, $"/machines/{machineId}", string.Join('/', levels[2..]), root,
                    ("machineid", machineId));

            case ["sites", var siteId, var source, _, ..]:
                reason = null;
                return Wrap(input, subject, SiteValueType, $"/sites/{siteId}/{source}", string.Join('/', levels[3..]), root,
                    ("siteid", siteId));

            default:
                reason = "the topic is not one of the MQTT binding";
                return null;
        }
    }

    /// <summary>
    /// Whether a prefix is one or more NATS tokens, joined by dots, without wildcards.
    /// </summary>
    public static bool IsValidPrefix(string prefix) =>
        !string.IsNullOrEmpty(prefix) && prefix.Split('.').All(IsToken);

    /// <summary>A NATS token: not empty, no <c>.</c>, no wildcard, no white space or control character.</summary>
    internal static bool IsToken(string level) =>
        level.Length > 0 && !level.Any(c => c is '.' or '*' or '>' || char.IsWhiteSpace(c) || char.IsControl(c));

    private static NatsCloudEvent? PassEvent(MqttInput input, string subject, string machineId, JsonElement cloudEvent, out string? reason)
    {
        // ContentType is an MQTT 5 property; its parameters (charset=utf-8) do not change what it is.
        if (input.ContentType is null
            || !input.ContentType.Split(';')[0].Trim().Equals(CloudEventContentType, StringComparison.OrdinalIgnoreCase))
        {
            reason = $"an event without the content type {CloudEventContentType}";
            return null;
        }
        if (Text(cloudEvent, "specversion") != "1.0" || Text(cloudEvent, "id") is not { Length: > 0 } id
            || Text(cloudEvent, "source") is not { Length: > 0 } source || Text(cloudEvent, "type") is not { Length: > 0 } type)
        {
            reason = $"an event of {machineId} without specversion 1.0, id, source or type";
            return null;
        }

        reason = null;
        // As it came, byte for byte: the event belongs to the machine, the bridge only carries it.
        // A CloudEvent is unique by source and id together, so the message id of JetStream is made of both.
        return new NatsCloudEvent(subject, id, Hash(source, Encoding.UTF8.GetBytes(id)), type, input.Payload.ToArray());
    }

    private static NatsCloudEvent Wrap(MqttInput input, string subject, string type, string source, string path,
        JsonElement envelope, (string Name, string Value) owner)
    {
        var id = Hash(input.Topic, input.Payload.Span);

        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("specversion", "1.0");
            writer.WriteString("id", id);
            writer.WriteString("source", source);
            writer.WriteString("type", type);
            writer.WriteString("subject", path);
            writer.WriteString("time", TimeOf(envelope));
            writer.WriteString("datacontenttype", "application/json");
            writer.WriteString(owner.Name, owner.Value);
            writer.WriteString("mqtttopic", input.Topic);
            writer.WriteBoolean("mqttretained", input.Retained);
            writer.WritePropertyName("data");
            envelope.WriteTo(writer);
            writer.WriteEndObject();
        }
        return new NatsCloudEvent(subject, id, id, type, buffer.ToArray());
    }

    /// <summary>
    /// The first 128 bits of SHA-256 over <paramref name="first"/> (UTF-8), a line feed and <paramref name="second"/>, as
    /// 32 hex digits. For a wrapped value: topic and payload, so a retained value handed over again keeps its id, and a
    /// new value, with a new timestamp, gets a new one. For an event: source and id.
    /// </summary>
    internal static string Hash(string first, ReadOnlySpan<byte> second)
    {
        var head = Encoding.UTF8.GetBytes(first);
        var bytes = new byte[head.Length + 1 + second.Length];
        head.CopyTo(bytes, 0);
        bytes[head.Length] = (byte)'\n';
        second.CopyTo(bytes.AsSpan(head.Length + 1));
        return Convert.ToHexStringLower(SHA256.HashData(bytes).AsSpan(0, 16));
    }

    /// <summary>
    /// The time of the CloudEvent: the <c>timestamp</c> of the envelope, the source time, in UTC, with milliseconds, or
    /// with seven digits where it is finer. An envelope without a readable one (the manifest) gets the time the bridge
    /// read it.
    /// </summary>
    private static string TimeOf(JsonElement envelope)
    {
        var time = Text(envelope, "timestamp") is { } text
            && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
                ? parsed
                : DateTimeOffset.UtcNow;
        var utc = time.UtcDateTime;
        var format = utc.Ticks % TimeSpan.TicksPerMillisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss.fff'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'";
        return utc.ToString(format, CultureInfo.InvariantCulture);
    }

    private static string? Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
