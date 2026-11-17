// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json.Nodes;

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
/// An event: something that happened once. <see cref="Seq"/> numbers the events of a machine without a gap, from 1
/// in each epoch. <see cref="Value"/> is a flat struct.
/// </summary>
internal sealed record SpecEvent(string Path, DateTimeOffset Timestamp, long Seq, JsonObject Value) : SpecMessage(Path, Timestamp);

/// <summary>Writes the messages of the spec binding: topics and payloads.</summary>
internal static class SpecWire
{
    /// <summary>
    /// The root of every topic of the spec binding. The output stands for the simulator of a machine; it lies below
    /// <c>simulators/{SerialNumber}/</c>, beside <c>machines/{SerialNumber}/</c> of the binding of the playground.
    /// Below the serial number comes a namespace level, as namespaces in OPC UA: <c>umati</c> for the elements of
    /// the model, <c>oem</c> for the signals the machine manufacturer defines, and <c>events</c> for the events.
    /// </summary>
    public const string Root = "simulators";

    /// <summary>The namespace of the elements of the model and of the manifest.</summary>
    public const string ModelLevel = "umati";

    /// <summary>The namespace of the signals the machine manufacturer defines.</summary>
    public const string OemLevel = "oem";

    /// <summary>The MQTT 5 content type of every payload.</summary>
    public const string ContentType = "application/json";

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
    public static string Topic(string serialNumber, string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (path.StartsWith("x-", StringComparison.Ordinal))
        {
            var dot = path.IndexOf('.', StringComparison.Ordinal);
            if (dot < 3 || !path[2..dot].All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-'))
            {
                throw new ArgumentException($"'{path}' has no prefix x-<domain> of the model.", nameof(path));
            }
            return $"{Root}/{serialNumber}/{OemLevel}/{path[(dot + 1)..].Replace('.', '/')}";
        }
        return $"{Root}/{serialNumber}/{ModelLevel}/{path.Replace('.', '/')}";
    }

    /// <summary>The level below the machine under which every event lies.</summary>
    public const string EventsLevel = "events";

    /// <summary>
    /// The topic name of each group of events, the group being the first segment of the path of an event. The
    /// names are those of the binding, in lower case; <c>notifications</c> is the name the binding of the
    /// playground uses for the same events (<c>machines/{SerialNumber}/events/notifications</c>).
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> EventTopicNames = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["Production"] = "production",
        ["Notification"] = "notifications",
    };

    /// <summary>
    /// The topic of an event: one topic per group, below <c>events/</c>, named after <see cref="EventTopicNames"/>.
    /// So every event of <c>Production</c> goes to <c>events/production</c>. MQTT keeps the order only within a
    /// topic; on one topic the events of a group arrive in the order they came up. The field <c>event</c> tells
    /// them apart.
    /// </summary>
    /// <exception cref="ArgumentException">The group of the event has no topic name.</exception>
    public static string EventTopic(string serialNumber, string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var group = path.Split('.')[0];
        if (!EventTopicNames.TryGetValue(group, out var name))
        {
            throw new ArgumentException($"The group '{group}' of the event '{path}' has no topic name.", nameof(path));
        }
        return $"{Root}/{serialNumber}/{EventsLevel}/{name}";
    }

    /// <summary>The topic of the manifest, below <c>umati/</c>.</summary>
    public static string ManifestTopic(string serialNumber)
    {
        return $"{Root}/{serialNumber}/{ModelLevel}/Manifest";
    }

    /// <summary>Source time in UTC, ISO 8601 with milliseconds and <c>Z</c>.</summary>
    public static string Timestamp(DateTimeOffset timestamp)
    {
        return timestamp.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
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
    /// The event <c>{event, timestamp, seq, seqEpoch, value}</c>. <c>seq</c> and <c>seqEpoch</c> belong to the
    /// binding: with them a consumer finds a gap or a duplicate.
    /// </summary>
    public static JsonObject Event(SpecEvent specEvent, string seqEpoch)
    {
        ArgumentNullException.ThrowIfNull(specEvent);
        return new JsonObject
        {
            ["event"] = specEvent.Path,
            ["timestamp"] = Timestamp(specEvent.Timestamp),
            ["seq"] = specEvent.Seq,
            ["seqEpoch"] = seqEpoch,
            ["value"] = specEvent.Value.DeepClone(),
        };
    }
}
