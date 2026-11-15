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

/// <summary>An event: something that happened once. <see cref="Value"/> is a flat struct.</summary>
internal sealed record SpecEvent(string Path, DateTimeOffset Timestamp, JsonObject Value) : SpecMessage(Path, Timestamp);

/// <summary>Writes the messages of the spec binding: topics and payloads.</summary>
internal static class SpecWire
{
    /// <summary>The root of every topic of the spec binding.</summary>
    public const string Root = "umati";

    /// <summary>The MQTT 5 content type of every payload.</summary>
    public const string ContentType = "application/json";

    /// <summary>
    /// The machine id of the topics: the manufacturer domain with <c>-</c> for every dot, then <c>_</c>, then the
    /// serial number. Only <c>[A-Za-z0-9_-]</c> is allowed.
    /// </summary>
    public static string MachineId(string manufacturerDomain, string serialNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(manufacturerDomain);
        ArgumentException.ThrowIfNullOrWhiteSpace(serialNumber);
#pragma warning disable CA1308 // A domain is lower case by convention; the id is not compared culture-sensitively.
        var id = $"{manufacturerDomain.Trim().ToLowerInvariant().Replace('.', '-')}_{serialNumber}";
#pragma warning restore CA1308
        if (!id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))
        {
            throw new ArgumentException(
                $"The machine id '{id}' may contain only letters, digits, '-' and '_'; check the domain and the serial number.");
        }
        return id;
    }

    /// <summary>The topic of an element or event: every dot of the path becomes a topic level.</summary>
    public static string Topic(string machineId, string path)
    {
        return $"{Root}/{machineId}/{path.Replace('.', '/')}";
    }

    /// <summary>The topic of the manifest.</summary>
    public static string ManifestTopic(string machineId)
    {
        return $"{Root}/{machineId}/Manifest";
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

    /// <summary>The event <c>{event, timestamp, value}</c>.</summary>
    public static JsonObject Event(SpecEvent specEvent)
    {
        ArgumentNullException.ThrowIfNull(specEvent);
        return new JsonObject
        {
            ["event"] = specEvent.Path,
            ["timestamp"] = Timestamp(specEvent.Timestamp),
            ["value"] = specEvent.Value.DeepClone(),
        };
    }
}
