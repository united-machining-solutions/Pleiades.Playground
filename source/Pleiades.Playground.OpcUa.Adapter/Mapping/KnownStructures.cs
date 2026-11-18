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
}
