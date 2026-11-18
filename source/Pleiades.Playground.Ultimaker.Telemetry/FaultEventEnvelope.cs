// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>
/// Gives the events of the printer the envelope of the MQTT binding: a CloudEvent 1.0 in structured mode,
/// counted without a gap from the start of the adapter. One instance per run of the adapter.
/// </summary>
internal sealed class FaultEventEnvelope(string source, DateTimeOffset start)
{
    /// <summary>The MQTT 5 content type of an event: a CloudEvent in structured mode.</summary>
    internal const string ContentType = "application/cloudevents+json; charset=utf-8";

    /// <summary>The version of the data model whose event schema the events follow.</summary>
    internal const string ModelVersion = "0.17.1";

    private const string Group = "Notification";
    private readonly string _source = UriReference(source);
    private readonly string _prefix = start.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    private long _count;

    /// <summary>
    /// The event as it goes out. <c>sequence</c> counts the events of this run from 1; the id follows from the
    /// machine, the group and the sequence, so an event that goes out again keeps its id.
    /// </summary>
    internal JsonObject Wrap(PrinterEvent printerEvent)
    {
        var sequence = string.Create(CultureInfo.InvariantCulture, $"{_prefix}.{++_count:D12}");
        return new JsonObject
        {
            ["specversion"] = "1.0",
            ["id"] = NameUuid($"{_source} {Group} {sequence}"),
            ["source"] = _source,
            ["type"] = printerEvent.Type,
            ["time"] = Timestamp(printerEvent.Time),
            ["sequence"] = sequence,
            ["dataschema"] = $"urn:umati2:datamodel:{ModelVersion}:event.schema.json",
            ["data"] = printerEvent.Data.DeepClone(),
        };
    }

    internal static string Timestamp(DateTimeOffset time)
        => time.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    // A UUID made from a name (version 5, RFC 9562): the same name gives the same UUID.
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Security", "CA5350:Do not use weak cryptographic algorithms",
        Justification = "SHA-1 is what RFC 9562 names for a UUID of version 5; it makes an id, it protects nothing")]
    private static string NameUuid(string name)
    {
        Span<byte> hash = stackalloc byte[20];
        SHA1.HashData(Encoding.UTF8.GetBytes(name), hash);
        var bytes = hash[..16];
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x50);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes, bigEndian: true).ToString();
    }

    // A character a URI may not hold, such as a space, percent-encoded.
    private static string UriReference(string text)
    {
        var builder = new StringBuilder(text.Length);
        foreach (var rune in text.EnumerateRunes())
        {
            var allowed = rune.Value is > 0x20 and < 0x7F && rune.Value is not ('"' or '<' or '>' or '\\' or '^' or '`' or '{' or '|' or '}');
            builder.Append(allowed ? rune.ToString() : Uri.EscapeDataString(rune.ToString()));
        }
        return builder.ToString();
    }
}
