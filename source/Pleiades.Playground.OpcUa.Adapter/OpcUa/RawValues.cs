using Opc.Ua;
using Pleiades.Playground.OpcUa.Adapter.Mapping;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>The value of a node as the converter takes it, the same for a read and a subscription.</summary>
internal static class RawValues
{
    /// <summary>
    /// The value of a variant: a text for a localized text, a <see cref="DateTime"/> for a time, a
    /// <see cref="StructureValue"/> for a structure the adapter knows (<see cref="KnownStructures"/>), and
    /// the boxed value of the stack for anything else.
    /// </summary>
    public static object? Of(Variant value, NamespaceTable namespaces)
    {
        ArgumentNullException.ThrowIfNull(namespaces);
        return value.AsBoxedObject(Variant.BoxingBehavior.Legacy) switch
        {
            LocalizedText text => text.Text,
            DateTimeUtc time => time.ToDateTime(),
            ExtensionObject extension => Decode(extension, namespaces) ?? (object)extension,
            var other => other,
        };
    }

    private static StructureValue? Decode(ExtensionObject extension, NamespaceTable namespaces)
    {
        if (extension.IsNull || extension.Encoding != ExtensionObjectEncoding.Binary)
        {
            return null;
        }

        // A structure of a type the session does not know arrives as the bytes of its binary encoding,
        // and the body is exactly those bytes. TryGetAsBinary would encode a known body again and wants
        // the message context of the session, which the subscription does not hand out.
#pragma warning disable CS0618
        var body = extension.Body switch
        {
            ByteString bytes => bytes.ToArray(),
            byte[] bytes => bytes,
            _ => null,
        };
#pragma warning restore CS0618
        if (body is null)
        {
            return null;
        }

        var typeId = ExpandedNodeId.ToNodeId(extension.TypeId, namespaces);
        return typeId.IsNull ? null : KnownStructures.Decode(UaAddressSpace.Portable(typeId, namespaces), body);
    }
}
