using System.Buffers.Binary;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>A structure the adapter decoded: its members by name, each a value of a built-in type.</summary>
/// <param name="Type">The encoding of the structure, as a node with the namespace as a URI.</param>
/// <param name="Members">The members by name, in the order of the structure.</param>
internal sealed record StructureValue(string Type, IReadOnlyList<KeyValuePair<string, object>> Members)
{
    /// <summary>The member of this name, or null.</summary>
    public object? Member(string name) =>
        Members.FirstOrDefault(member => string.Equals(member.Key, name, StringComparison.Ordinal)).Value;

    /// <summary>The members as <c>Name=Value</c>, for a person who looks at the raw value.</summary>
    public override string ToString() =>
        string.Join(", ", Members.Select(member => $"{member.Key}={ValueConverter.KeyOf(member.Value)}"));
}

/// <summary>
/// The structures whose binary encoding the adapter decodes itself, by the definition read from the
/// server when the rule was written. Nothing is loaded from the server at run time: a structure of
/// another type stays undecoded, and an element that wants a member of it gets no value.
/// </summary>
internal static class KnownStructures
{
    /// <summary>
    /// Decodes the binary body of a structure of the encoding <paramref name="encoding"/>, written as a
    /// node with its namespace as a URI. Null for an encoding the adapter does not know, or a body that
    /// is too short for it.
    /// </summary>
    public static StructureValue? Decode(string? encoding, ReadOnlySpan<byte> body)
    {
        if (encoding is null
            || !KnownMappings.IsNamespace(KnownMappings.NamespaceOf(encoding), Umati2DataModel.Namespace)
            || !encoding.EndsWith(";" + Umati2DataModel.StatusEncoding, StringComparison.Ordinal))
        {
            return null;
        }

        // DataType.Status: two enumerations, each an Int32 in the binary encoding.
        if (body.Length < 8)
        {
            return null;
        }

        return new StructureValue(
            encoding,
            [
                new("MachineryItemState", BinaryPrimitives.ReadInt32LittleEndian(body)),
                new("MachineryOperationMode", BinaryPrimitives.ReadInt32LittleEndian(body[4..])),
            ]);
    }

    /// <summary>Whether an encoding, written as a node with its namespace as a URI, is that of <c>DataType.Alert</c>.</summary>
    public static bool IsAlert(string? encoding) =>
        encoding is not null
        && KnownMappings.IsNamespace(KnownMappings.NamespaceOf(encoding), Umati2DataModel.Namespace)
        && encoding.EndsWith(";" + Umati2DataModel.AlertEncoding, StringComparison.Ordinal);

    /// <summary>
    /// Decodes the binary body of one <c>DataType.Alert</c> of <c>urn:umati2:datamodel:opcua</c>, by the
    /// definition the TRUMPF OPC UA simulator gave on 2026-11-18: <c>Id</c>, <c>ErrorCode</c> and
    /// <c>Message</c> (String), <c>Severity</c> (<c>DataType.AlertSeverity</c>, an Int32), <c>SeverityValue</c>
    /// (UInt16), <c>Time</c> (DateTime), <c>SourceName</c> and <c>correlationId</c> (String). Null for a body
    /// that does not hold these, or an alert without an <c>Id</c>.
    /// </summary>
    public static ListedAlert? DecodeAlert(ReadOnlySpan<byte> body)
    {
        var reader = new BinaryReader(body);
        var id = reader.String();
        var code = reader.String();
        var message = reader.String();
        var severity = reader.Int32();
        var severityValue = reader.UInt16();
        var time = reader.DateTime();
        var sourceName = reader.String();
        if (!reader.Ok || string.IsNullOrEmpty(id))
        {
            return null;
        }

        // correlationId is the last member and optional to the adapter: an older server may leave it out.
        return new ListedAlert(id, code ?? string.Empty, message ?? string.Empty, SeverityName(severity!.Value), severityValue!.Value, time, sourceName);
    }

    /// <summary>The name of a value of <c>DataType.AlertSeverity</c>, the categories of NAMUR NE 107; null for another value.</summary>
    public static string? SeverityName(int value) => value switch
    {
        1 => "Failure",
        2 => "CheckFunction",
        3 => "OffSpec",
        4 => "MaintenanceRequired",
        _ => null,
    };

    /// <summary>Reads the built-in types of the binary encoding of OPC UA, and remembers whether the body was long enough.</summary>
    private ref struct BinaryReader(ReadOnlySpan<byte> body)
    {
        private readonly ReadOnlySpan<byte> _body = body;
        private int _at;

        public bool Ok { get; private set; } = true;

        public string? String()
        {
            if (Int32() is not { } length || length < 0)
            {
                return null;
            }

            if (_body.Length - _at < length)
            {
                Ok = false;
                return null;
            }

            var text = System.Text.Encoding.UTF8.GetString(_body.Slice(_at, length));
            _at += length;
            return text;
        }

        public int? Int32() => Take(4) is { } at ? BinaryPrimitives.ReadInt32LittleEndian(_body[at..]) : null;

        public int? UInt16() => Take(2) is { } at ? BinaryPrimitives.ReadUInt16LittleEndian(_body[at..]) : null;

        /// <summary>A DateTime: ticks of 100 ns since 1601-01-01 UTC. Zero, or a time out of range, is no time.</summary>
        public DateTime? DateTime()
        {
            if (Take(8) is not { } at)
            {
                return null;
            }

            var ticks = BinaryPrimitives.ReadInt64LittleEndian(_body[at..]);
            var epoch = new DateTime(1601, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            return ticks <= 0 || ticks > System.DateTime.MaxValue.Ticks - epoch.Ticks ? null : epoch.AddTicks(ticks);
        }

        private int? Take(int count)
        {
            if (!Ok || _body.Length - _at < count)
            {
                Ok = false;
                return null;
            }

            var at = _at;
            _at += count;
            return at;
        }
    }
}

/// <summary>One alert of the list <c>Notification.ActiveAlerts</c> of <c>urn:umati2:datamodel:opcua</c>, as the server gave it.</summary>
/// <param name="Id">The id of the alert, the same from its raising to its clearing.</param>
/// <param name="ErrorCode">The code of the maker.</param>
/// <param name="Message">The text for the operator.</param>
/// <param name="Severity">The category of NAMUR NE 107, or null if the server gave none the adapter knows.</param>
/// <param name="SeverityValue">The severity of OPC UA, 1 to 1000; 0 if absent.</param>
/// <param name="Time">When the alert came up, or null if the server gave no time.</param>
/// <param name="SourceName">The part of the machine it came from.</param>
internal sealed record ListedAlert(
    string Id, string ErrorCode, string Message, string? Severity, int SeverityValue, DateTime? Time, string? SourceName);
