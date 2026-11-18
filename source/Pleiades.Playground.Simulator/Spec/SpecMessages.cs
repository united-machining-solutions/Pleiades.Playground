// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>What the virtual machine says: a new value of an element or an event.</summary>
internal abstract record SpecMessage(string Path, DateTimeOffset Timestamp);

/// <summary>
/// A value of an element with its envelope. <see cref="Value"/> is a JSON value, object (snapshot), array (list)
/// or <see langword="null"/> (not available right now).
/// </summary>
internal sealed record SpecValue(string Path, JsonNode? Value, string? Unit, DateTimeOffset Timestamp, string? CorrelationId)
    : SpecMessage(Path, Timestamp);

/// <summary>
/// An event: something that happened once. <see cref="Seq"/> counts the events of its group (the first segment of
/// the path) without a gap, from 1 in each run of the machine; <see cref="Sequence"/> is that number as the binding
/// sends it, the start of the run and the count. <see cref="Id"/> is a UUID that stays the same when the event goes
/// out again. <see cref="Value"/> is a flat struct, the <c>data</c> of the CloudEvent. <see cref="Related"/> never goes
/// on the wire: the entry of the other list of the same job order (its result for an event of the job order, the
/// job order for an event of its result), for the production events of the playground, which carry both.
/// </summary>
internal sealed record SpecEvent(
    string Path, DateTimeOffset Timestamp, long Seq, JsonObject Value, string Id, string Sequence, string? CorrelationId = null, JsonObject? Related = null)
    : SpecMessage(Path, Timestamp);

/// <summary>Writes the messages of the spec binding: topics and payloads.</summary>
internal static class SpecWire
{
    /// <summary>
    /// The root of every topic of the binding: <c>machines/{MachineId}/</c>. Below the machine id comes a namespace
    /// level, as namespaces in OPC UA: <c>umati</c> for the elements of the model, <c>oem</c> for the signals the
    /// machine manufacturer defines, and <c>events</c> for the events.
    /// </summary>
    public const string Root = "machines";

    /// <summary>The most characters of one part of a machine id.</summary>
    public const int MachineIdPartLength = MachineBinding.MachineIdPartLength;

    /// <summary>
    /// The machine id of the spec binding, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>, for example
    /// <c>alcyone-machines_AX-400_P-04</c>. The manufacturer is the domain of its <c>ManufacturerUri</c> in lower case,
    /// without a leading <c>www.</c> and without its top-level domain (the last label only, so <c>co.uk</c> leaves
    /// <c>co</c>), every dot a <c>-</c>: it stays when the company is renamed. Each part is normalised
    /// (<see cref="MachineIdPart"/>); <c>_</c> separates the parts and never occurs in one.
    /// </summary>
    public static string MachineId(string manufacturerUri, string model, string serialNumber)
    {
        return MachineBinding.MachineId(manufacturerUri, model, serialNumber);
    }

    /// <summary>
    /// One part of a machine id: ä, ö, ü and ß written out (<c>ae</c>, <c>oe</c>, <c>ue</c>, <c>ss</c>), other accents
    /// dropped, every character but <c>A-Z</c>, <c>a-z</c>, <c>0-9</c> and <c>-</c> a <c>-</c>, several <c>-</c> one,
    /// none at the start or the end, at most <see cref="MachineIdPartLength"/> characters. An empty part is
    /// <c>unknown</c>. So a part holds nothing MQTT, NATS or a file name would read otherwise.
    /// </summary>
    public static string MachineIdPart(string? text)
    {
        return MachineBinding.MachineIdPart(text);
    }

    /// <summary>The namespace of the elements of the model and of the manifest.</summary>
    public const string ModelLevel = "umati";

    /// <summary>The namespace of the signals the machine manufacturer defines.</summary>
    public const string OemLevel = "oem";

    /// <summary>The MQTT 5 content type of a value and of the manifest.</summary>
    public const string ContentType = MachineBinding.ContentType;

    /// <summary>The MQTT 5 content type of an event: a CloudEvent in structured mode.</summary>
    public const string EventContentType = "application/cloudevents+json; charset=utf-8";

    /// <summary>The <c>dataschema</c> of every event: the <c>$id</c> of the event schema of the model version.</summary>
    public const string EventDataSchema = $"urn:umati2:datamodel:{SpecElements.ModelVersion}:event.schema.json";

    /// <summary>The names of the namespace level; the binding uses no others.</summary>
    public static readonly IReadOnlySet<string> ReservedNamespaces = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ModelLevel, OemLevel, "events" };

    /// <summary>
    /// The topic of an element, every dot of its path a topic level, below its namespace. An element of the model
    /// goes below <c>umati/</c>. A signal of the manufacturer, whose path begins with the one prefix segment
    /// <c>x-&lt;domain&gt;</c> of the model, goes below <c>oem/</c>: the binding maps <c>x-&lt;domain&gt;.&lt;path&gt;</c> to
    /// <c>oem/&lt;path&gt;</c>, so the signal lies at the same place of the tree as the elements of the model, only in
    /// another namespace. The domain of the manufacturer stays in the manifest; the topic carries none.
    /// </summary>
    /// <exception cref="ArgumentException">A path with <c>x-</c> has no valid prefix segment.</exception>
    public static string Topic(string machineId, string path)
    {
        return MachineBinding.Topic(machineId, path);
    }

    /// <summary>The level below the machine under which every event lies.</summary>
    public const string EventsLevel = "events";

    /// <summary>
    /// The topic name of each group of events, the group being the first segment of the path of an event: the one
    /// place where the binding maps a group to its topic. The topic names the subject of the events, not the
    /// profile: the events of a job order may come from a job management (ordering) one day too, not only from
    /// monitoring. Each group, and so each topic, counts its own <c>sequence</c>.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> EventTopicNames = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["JobMonitoring"] = "jobs",
        ["WorkMasterMonitoring"] = "workmasters",
        ["Notification"] = "notifications",
    };

    /// <summary>
    /// The topic of an event: one topic per group, below <c>events/</c>, named after <see cref="EventTopicNames"/>.
    /// So every event of <c>JobMonitoring</c> goes to <c>events/jobs</c>. MQTT keeps the order only within a
    /// topic; on one topic the events of a group arrive in the order they came up. The attribute <c>type</c>
    /// tells them apart.
    /// </summary>
    /// <exception cref="ArgumentException">The group of the event has no topic name.</exception>
    public static string EventTopic(string machineId, string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var group = path.Split('.')[0];
        if (!EventTopicNames.TryGetValue(group, out var name))
        {
            throw new ArgumentException($"The group '{group}' of the event '{path}' has no topic name.", nameof(path));
        }
        return $"{Root}/{machineId}/{EventsLevel}/{name}";
    }

    /// <summary>The topic of the manifest, below <c>umati/</c>.</summary>
    public static string ManifestTopic(string machineId)
    {
        return $"{Root}/{machineId}/{ModelLevel}/Manifest";
    }

    /// <summary>Source time in UTC, ISO 8601 with milliseconds and <c>Z</c>.</summary>
    public static string Timestamp(DateTimeOffset timestamp)
    {
        return MachineBinding.Timestamp(timestamp);
    }

    /// <summary>The value envelope <c>{timestamp, value, unit?, correlationId?}</c>.</summary>
    public static JsonObject Envelope(SpecValue value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var envelope = new JsonObject
        {
            ["timestamp"] = Timestamp(value.Timestamp),
            ["value"] = value.Value?.DeepClone(),
        };
        if (value.Unit is not null && value.Value is JsonValue)
        {
            envelope["unit"] = value.Unit;
        }
        if (value.CorrelationId is not null)
        {
            envelope["correlationId"] = value.CorrelationId;
        }
        return envelope;
    }

    /// <summary>
    /// The start of a run as the prefix of <c>sequence</c>: UTC, <c>yyyyMMddTHHmmssZ</c>.
    /// </summary>
    public static string SequencePrefix(DateTimeOffset start)
    {
        return start.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// The <c>sequence</c> of an event: the prefix of the run, a dot and the count of the event in its group with
    /// twelve digits, for example <c>20261117T065812Z.000000000123</c>. A comparison of strings orders the events of
    /// a group; a new prefix shows a new run.
    /// </summary>
    public static string Sequence(string prefix, long count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);
        return string.Create(CultureInfo.InvariantCulture, $"{prefix}.{count:D12}");
    }

    /// <summary>
    /// The event as a CloudEvent 1.0 in the JSON format, structured mode: <c>specversion</c>, <c>id</c>,
    /// <c>source</c> (the ProductInstanceUri of the machine), <c>type</c> (the path of the event), <c>time</c>,
    /// <c>sequence</c>, <c>correlationid</c> where the event belongs to a program execution, <c>dataschema</c> and
    /// <c>data</c>, the flat struct of the event.
    /// </summary>
    public static JsonObject Event(SpecEvent specEvent, string source)
    {
        ArgumentNullException.ThrowIfNull(specEvent);
        ArgumentException.ThrowIfNullOrWhiteSpace(source);
        var cloudEvent = new JsonObject
        {
            ["specversion"] = "1.0",
            ["id"] = specEvent.Id,
            ["source"] = UriReference(source),
            ["type"] = specEvent.Path,
            ["time"] = Timestamp(specEvent.Timestamp),
            ["sequence"] = specEvent.Sequence,
        };
        if (specEvent.CorrelationId is not null)
        {
            cloudEvent["correlationid"] = specEvent.CorrelationId;
        }
        cloudEvent["dataschema"] = EventDataSchema;
        cloudEvent["data"] = specEvent.Value.DeepClone();
        return cloudEvent;
    }

    /// <summary>
    /// A UUID made from a name (version 5, after RFC 9562): the same name gives the same UUID. The virtual machine
    /// names an event by its machine, its run, its group and its count, so the id is unique and the same each time
    /// the event goes out, and a run with the same seed gives the same ids.
    /// </summary>
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Security", "CA5350:Do not use weak cryptographic algorithms",
        Justification = "SHA-1 is what RFC 9562 names for a UUID of version 5; it makes an id, it protects nothing")]
    public static string NameUuid(string name)
    {
        ArgumentNullException.ThrowIfNull(name);
        Span<byte> hash = stackalloc byte[20];
        SHA1.HashData(Encoding.UTF8.GetBytes(name), hash);
        var bytes = hash[..16];
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x50);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes, bigEndian: true).ToString();
    }

    /// <summary>
    /// The text as a valid URI reference: a character a URI may not hold, such as a space, percent-encoded.
    /// </summary>
    public static string UriReference(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        var builder = new StringBuilder(text.Length);
        foreach (var rune in text.EnumerateRunes())
        {
            var allowed = rune.Value is > 0x20 and < 0x7F && rune.Value is not ('"' or '<' or '>' or '\\' or '^' or '`' or '{' or '|' or '}');
            builder.Append(allowed ? rune.ToString() : Uri.EscapeDataString(rune.ToString()));
        }
        return builder.ToString();
    }
}
