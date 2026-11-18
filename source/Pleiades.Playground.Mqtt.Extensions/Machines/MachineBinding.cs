// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using MQTTnet;
using MQTTnet.Protocol;

// The URIs of the model are texts on the wire: they are kept as the configuration and the model give them.
#pragma warning disable CA1054, CA1056

namespace Pleiades.Playground.Mqtt.Extensions.Machines;

/// <summary>
/// The MQTT binding of machines to the data model (contracts/mqtt, "Machines: the binding of the data model"):
/// machine ids, topics, the value envelope, the states of <c>Connection.State</c> and the last will. One place for
/// every producer below <c>machines/</c>: the simulator and the adapters of real devices.
/// </summary>
public static class MachineBinding
{
    /// <summary>The version of the data model the binding follows.</summary>
    public const string ModelVersion = "0.17.1";

    /// <summary>The version of this binding, named in every manifest.</summary>
    public const string BindingVersion = "0.1.0-draft";

    /// <summary>The root of every topic of the binding.</summary>
    public const string Root = "machines";

    /// <summary>The namespace of the elements of the model and of the manifest.</summary>
    public const string ModelLevel = "umati";

    /// <summary>The namespace of the signals the machine manufacturer defines.</summary>
    public const string OemLevel = "oem";

    /// <summary>The MQTT 5 content type of a value and of the manifest.</summary>
    public const string ContentType = "application/json";

    /// <summary>The most characters of one part of a machine id.</summary>
    public const int MachineIdPartLength = 64;

    /// <summary>The path of <c>Connection.State</c>, the state of the adapter.</summary>
    public const string ConnectionState = "Connection.State";

    /// <summary>The path of <c>Connection.Heartbeat</c>, the sign of life of the adapter.</summary>
    public const string Heartbeat = "Connection.Heartbeat";

    /// <summary>The value of <c>Connection.State</c> while the adapter starts and reads the machine.</summary>
    public const string Initializing = "Initializing";

    /// <summary>The value of <c>Connection.State</c> of a running adapter that reaches the machine.</summary>
    public const string Running = "Running";

    /// <summary>The value of <c>Connection.State</c> while the adapter cannot reach the machine.</summary>
    public const string CommunicationFault = "CommunicationFault";

    /// <summary>The value of <c>Connection.State</c> at a clean stop, the last message before it.</summary>
    public const string Shutdown = "Shutdown";

    /// <summary>
    /// The value of <c>Connection.State</c> in the last will. The model has no value for an adapter that is gone;
    /// of its four values <c>CommunicationFault</c> comes closest: the values stand, but they are not current.
    /// </summary>
    public const string LastWillState = CommunicationFault;

    /// <summary>
    /// The machine id, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>. The manufacturer is the domain of its
    /// <c>ManufacturerUri</c> (<see cref="DomainOf"/>) without its top-level domain (the last label only, so
    /// <c>co.uk</c> leaves <c>co</c>), every dot a <c>-</c>. Each part is normalised (<see cref="MachineIdPart"/>);
    /// <c>_</c> separates the parts and never occurs in one.
    /// </summary>
    public static string MachineId(string manufacturerUri, string? model, string? serialNumber)
    {
        ArgumentNullException.ThrowIfNull(manufacturerUri);
        var manufacturer = DomainOf(manufacturerUri);
        var lastDot = manufacturer.LastIndexOf('.');
        if (lastDot > 0)
        {
            manufacturer = manufacturer[..lastDot];
        }
        return string.Join('_', MachineIdPart(manufacturer), MachineIdPart(model), MachineIdPart(serialNumber));
    }

    /// <summary>
    /// One part of a machine id: ä, ö, ü and ß written out (<c>ae</c>, <c>oe</c>, <c>ue</c>, <c>ss</c>), other accents
    /// dropped, every character but <c>A-Z</c>, <c>a-z</c>, <c>0-9</c> and <c>-</c> a <c>-</c>, several <c>-</c> one,
    /// none at the start or the end, at most <see cref="MachineIdPartLength"/> characters. An empty part is
    /// <c>unknown</c>. So a part holds nothing MQTT, NATS or a file name would read otherwise.
    /// </summary>
    public static string MachineIdPart(string? text)
    {
        var written = (text ?? string.Empty)
            .Replace("ä", "ae", StringComparison.Ordinal).Replace("ö", "oe", StringComparison.Ordinal).Replace("ü", "ue", StringComparison.Ordinal)
            .Replace("Ä", "Ae", StringComparison.Ordinal).Replace("Ö", "Oe", StringComparison.Ordinal).Replace("Ü", "Ue", StringComparison.Ordinal)
            .Replace("ß", "ss", StringComparison.Ordinal)
            .Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(written.Length);
        foreach (var c in written)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }
            var allowed = char.IsAsciiLetterOrDigit(c) || c == '-';
            if (allowed || (builder.Length > 0 && builder[^1] != '-'))
            {
                builder.Append(allowed ? c : '-');
            }
        }
        var part = builder.ToString();
        while (part.Contains("--", StringComparison.Ordinal))
        {
            part = part.Replace("--", "-", StringComparison.Ordinal);
        }
        part = part.Trim('-');
        if (part.Length > MachineIdPartLength)
        {
            part = part[..MachineIdPartLength].TrimEnd('-');
        }
        return part.Length == 0 ? "unknown" : part;
    }

    /// <summary>The domain of a web address, without a leading <c>www.</c>, in lower case.</summary>
    public static string DomainOf(string uri)
    {
        ArgumentNullException.ThrowIfNull(uri);
        var host = Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && !string.IsNullOrEmpty(parsed.Host) ? parsed.Host : uri.Trim();
#pragma warning disable CA1308 // A domain is lower case by convention.
        host = host.ToLowerInvariant();
#pragma warning restore CA1308
        return host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host;
    }

    /// <summary>
    /// The prefix of the signals of a manufacturer: exactly one segment <c>x-&lt;domain&gt;</c>, every dot of the domain a
    /// <c>-</c>, for example <c>x-alcyone-machines-example</c>.
    /// </summary>
    public static string ExtensionPrefix(string manufacturerDomain)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(manufacturerDomain);
#pragma warning disable CA1308 // A domain is lower case by convention, as in the machine id.
        return $"x-{manufacturerDomain.Trim().ToLowerInvariant().Replace('.', '-')}";
#pragma warning restore CA1308
    }

    /// <summary>
    /// The topic of an element, every dot of its path a topic level, below its namespace. An element of the model
    /// goes below <c>umati/</c>. A signal of the manufacturer, whose path begins with the one prefix segment
    /// <c>x-&lt;domain&gt;</c> of the model, goes below <c>oem/</c>: the binding maps <c>x-&lt;domain&gt;.&lt;path&gt;</c> to
    /// <c>oem/&lt;path&gt;</c>. The domain of the manufacturer stays in the manifest; the topic carries none.
    /// </summary>
    /// <exception cref="ArgumentException">A path with <c>x-</c> has no valid prefix segment.</exception>
    public static string Topic(string machineId, string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (path.StartsWith("x-", StringComparison.Ordinal))
        {
            var dot = path.IndexOf('.', StringComparison.Ordinal);
            if (dot < 3 || !path[2..dot].All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-'))
            {
                throw new ArgumentException($"'{path}' has no prefix x-<domain> of the model.", nameof(path));
            }
            return $"{Root}/{machineId}/{OemLevel}/{path[(dot + 1)..].Replace('.', '/')}";
        }
        return $"{Root}/{machineId}/{ModelLevel}/{path.Replace('.', '/')}";
    }

    /// <summary>The topic of the manifest, below <c>umati/</c>.</summary>
    public static string ManifestTopic(string machineId)
    {
        return $"{Root}/{machineId}/{ModelLevel}/Manifest";
    }

    /// <summary>Source time in UTC, ISO 8601 with milliseconds and <c>Z</c>.</summary>
    public static string Timestamp(DateTimeOffset timestamp)
    {
        return timestamp.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    /// <summary>The value envelope <c>{timestamp, value, unit?, correlationId?}</c>; a unit only with a plain value.</summary>
    public static JsonObject Envelope(MachineValue value)
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

    /// <summary>A value as the binding puts it on the broker: retained, QoS 1, <see cref="ContentType"/>.</summary>
    public static MqttApplicationMessage ValueMessage(string machineId, MachineValue value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return Message(Topic(machineId, value.Path), Envelope(value));
    }

    /// <summary>The manifest as the binding puts it on the broker: retained, QoS 1, <see cref="ContentType"/>.</summary>
    public static MqttApplicationMessage ManifestMessage(string machineId, JsonObject manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        return Message(ManifestTopic(machineId), manifest);
    }

    /// <summary>
    /// The last will: <c>Connection/State</c> <see cref="LastWillState"/>, which the broker publishes when the
    /// connection breaks off. Its timestamp is the time it is set, the connect: the binding has no way to put the
    /// time of the break into it.
    /// </summary>
    public static (string Topic, byte[] Payload) LastWill(string machineId, DateTimeOffset timestamp)
    {
        var will = new MachineValue(ConnectionState, JsonValue.Create(LastWillState), timestamp);
        return (Topic(machineId, ConnectionState), Encoding.UTF8.GetBytes(Envelope(will).ToJsonString()));
    }

    /// <summary>Sets the last will of the binding on the options of a client: retained, QoS 1.</summary>
    public static MqttClientOptionsBuilder WithMachineLastWill(this MqttClientOptionsBuilder builder, string machineId, DateTimeOffset timestamp)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var (topic, payload) = LastWill(machineId, timestamp);
        return builder
            .WithWillTopic(topic)
            .WithWillPayload(payload)
            .WithWillRetain(true)
            .WithWillQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithWillContentType(ContentType);
    }

    private static MqttApplicationMessage Message(string topic, JsonObject payload)
    {
        return new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(payload.ToJsonString()))
            .WithContentType(ContentType)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(true)
            .Build();
    }
}

/// <summary>
/// A value of an element of the binding. <see cref="Path"/> is the path of the model (<c>State.Status</c>) or of a
/// signal of the manufacturer (<c>x-&lt;domain&gt;.&lt;path&gt;</c>); <see cref="Value"/> a JSON value, an object
/// (snapshot), an array (list) or <see langword="null"/> (not available right now). <see cref="Unit"/> is the name
/// of the unit of the catalogue, sent with a number.
/// </summary>
public sealed record MachineValue(string Path, JsonNode? Value, DateTimeOffset Timestamp, string? Unit = null, string? CorrelationId = null);
