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

    /// <summary>
    /// The alerts of a value of <c>Notification.ActiveAlerts</c> of <c>urn:umati2:datamodel:opcua</c>, an array
    /// of <c>DataType.Alert</c>. No value, or an empty array, is no alert. Null if the value is not such an
    /// array, or an alert in it cannot be decoded: a list the adapter cannot read whole tells nothing.
    /// </summary>
    public static IReadOnlyList<ListedAlert>? AlertsOf(Variant value, NamespaceTable namespaces)
    {
        ArgumentNullException.ThrowIfNull(namespaces);
        var items = value.AsBoxedObject(Variant.BoxingBehavior.Legacy) switch
        {
            null => [],
            ExtensionObject single => [single],
            ExtensionObject[] array => array,
            IEnumerable<ExtensionObject> sequence => [.. sequence],
            _ => (ExtensionObject[]?)null,
        };
        if (items is null)
        {
            return null;
        }

        var alerts = new List<ListedAlert>(items.Length);
        foreach (var item in items)
        {
            if (BodyOf(item, namespaces) is not { } found
                || !KnownStructures.IsAlert(found.Encoding)
                || KnownStructures.DecodeAlert(found.Body) is not { } alert)
            {
                return null;
            }

            alerts.Add(alert);
        }

        return alerts;
    }

    private static StructureValue? Decode(ExtensionObject extension, NamespaceTable namespaces) =>
        BodyOf(extension, namespaces) is { } found ? KnownStructures.Decode(found.Encoding, found.Body) : null;

    /// <summary>The encoding of a structure, as a node with its namespace as a URI, and the bytes of its binary body.</summary>
    private static (string Encoding, byte[] Body)? BodyOf(ExtensionObject extension, NamespaceTable namespaces)
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
        return typeId.IsNull ? null : (UaAddressSpace.Portable(typeId, namespaces), body);
    }
}
