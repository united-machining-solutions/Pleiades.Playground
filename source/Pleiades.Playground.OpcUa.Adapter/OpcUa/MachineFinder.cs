using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>A node below another one, as a browse gives it.</summary>
/// <param name="Node">The node, with the namespace as a URI: <c>nsu=&lt;uri&gt;;s=Name</c>, or <c>i=85</c> in namespace 0.</param>
/// <param name="BrowseName">The name of the browse name, without its namespace.</param>
/// <param name="DisplayName">The name for people.</param>
/// <param name="IsObject">True for an object, false for a variable.</param>
internal sealed record BrowsedNode(string Node, string BrowseName, string DisplayName, bool IsObject);

/// <summary>What the finder needs of an OPC UA server: browse down and read values.</summary>
internal interface IAddressSpace
{
    /// <summary>The objects and variables below each node, by hierarchical references.</summary>
    Task<IReadOnlyList<IReadOnlyList<BrowsedNode>>> ChildrenAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken);

    /// <summary>The value of each node as text, or null if it has none.</summary>
    Task<IReadOnlyList<string?>> ReadTextsAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken);
}

/// <summary>A machine an OPC UA server serves.</summary>
/// <param name="Node">The object of the machine. It goes into <c>machineNode</c> of the registration.</param>
/// <param name="Path">Its browse path from Objects, by display names: <c>opcsim/Machines/TruLaser</c>.</param>
/// <param name="DisplayName">Its name for people.</param>
/// <param name="SerialNumber">The value of its <c>Identification/SerialNumber</c>, or null if it has none.</param>
/// <param name="Manufacturer">The value of its <c>Identification/Manufacturer</c>.</param>
/// <param name="Model">The value of its <c>Identification/Model</c>.</param>
/// <param name="ProductInstanceUri">The value of its <c>Identification/ProductInstanceUri</c>.</param>
/// <param name="SerialNumberNode">The node of its serial number.</param>
/// <param name="Namespaces">The namespaces of its instance: of the machine object and its identification.</param>
internal sealed record FoundMachine(
    string Node,
    string Path,
    string DisplayName,
    string? SerialNumber,
    string? Manufacturer,
    string? Model,
    string? ProductInstanceUri,
    string SerialNumberNode,
    IReadOnlyList<string> Namespaces);

/// <summary>
/// Lists the machines an OPC UA server serves, without a language model: every object below Objects
/// that has an <c>Identification</c> with a <c>SerialNumber</c>, the way OPC 40001-1 describes a
/// machine. It finds a machine below <c>Machines</c>, below a folder of an aggregation server, or
/// at the top of a server of its maker alike. Below a machine it does not look further. A TRUMPF
/// machine is also found by the root of its TRUMPF interface (<see cref="TrumpfMachines"/>), for a
/// gateway that leaves its <c>Machines</c> folder out.
/// </summary>
internal static class MachineFinder
{
    /// <summary>The Objects folder.</summary>
    public const string Objects = "i=85";

    /// <summary>The Server object, where no machine lives.</summary>
    public const string Server = "i=2253";

    /// <summary>How deep below Objects a machine is looked for.</summary>
    public const int MaxDepth = 5;

    /// <summary>How many objects are browsed at most, so a large server is not browsed whole.</summary>
    public const int MaxObjects = 600;

    private static readonly string[] Identification = ["SerialNumber", "Manufacturer", "Model", "ProductInstanceUri"];

    /// <summary>Finds the machines of a server, breadth first, the ones nearest to Objects first.</summary>
    public static async Task<IReadOnlyList<FoundMachine>> FindAsync(IAddressSpace space, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(space);
        var machines = new List<FoundMachine>();
        var trumpfRoots = new List<(BrowsedNode Root, string Path)>();
        var seen = new HashSet<string>(StringComparer.Ordinal) { Objects, Server };
        var level = new List<(string Node, string Path)> { (Objects, string.Empty) };
        var browsed = 0;

        for (var depth = 0; depth <= MaxDepth && level.Count > 0 && browsed < MaxObjects; depth++)
        {
            level = level.Take(MaxObjects - browsed).ToList();
            browsed += level.Count;
            var children = await space.ChildrenAsync([.. level.Select(one => one.Node)], cancellationToken).ConfigureAwait(false);

            // An object with an Identification is a candidate; its Identification is browsed next.
            var candidates = new List<(string Node, string Path, BrowsedNode Identification)>();
            var candidateChildren = new List<IReadOnlyList<BrowsedNode>>();
            var next = new List<(string Node, string Path)>();
            void Below(string path, IEnumerable<BrowsedNode> objects)
            {
                foreach (var child in objects.Where(child => child.IsObject && seen.Add(child.Node)))
                {
                    next.Add((child.Node, path.Length == 0 ? child.DisplayName : $"{path}/{child.DisplayName}"));
                }
            }

            for (var index = 0; index < level.Count; index++)
            {
                var (node, path) = level[index];
                var below = children[index];
                if (node != Objects && below.FirstOrDefault(child => child.IsObject && child.BrowseName == "Identification") is { } identification)
                {
                    candidates.Add((node, path, identification));
                    candidateChildren.Add(below);
                    continue;
                }

                // The root of a TRUMPF interface is a machine by the rule of TRUMPF; its large tree is not browsed.
                foreach (var root in below.Where(child => child.IsObject && TrumpfMachines.PrefixOfRoot(child.Node) is not null && seen.Add(child.Node)))
                {
                    trumpfRoots.Add((root, path.Length == 0 ? root.DisplayName : $"{path}/{root.DisplayName}"));
                }

                Below(path, below);
            }

            if (candidates.Count > 0)
            {
                var found = await IdentifyAsync(space, candidates, cancellationToken).ConfigureAwait(false);
                machines.AddRange(found.OfType<FoundMachine>());

                // A candidate without a serial number is no machine; what is below it may be.
                for (var index = 0; index < candidates.Count; index++)
                {
                    if (found[index] is null)
                    {
                        Below(candidates[index].Path, candidateChildren[index].Where(child => child.BrowseName != "Identification"));
                    }
                }
            }

            level = next;
        }

        // A TRUMPF machine the browse found by its Machines folder already is not listed twice; it
        // takes the model from the display name of its TRUMPF root, which its instance does not have.
        foreach (var machine in await TrumpfMachines.IdentifyAsync(space, trumpfRoots, cancellationToken).ConfigureAwait(false))
        {
            var known = machines.FindIndex(one => string.Equals(one.Node, machine.Node, StringComparison.Ordinal));
            if (known < 0)
            {
                machines.Add(machine);
            }
            else if (machines[known].Model is null)
            {
                machines[known] = machines[known] with { Model = machine.Model };
            }
        }

        return Merge(machines);
    }

    /// <summary>
    /// One entry per serial number. A server may show one machine in several namespaces, a gateway of an
    /// edge device for example in <see cref="Umati2DataModel.Namespace"/> and by the root of its TRUMPF
    /// interface; every topic is named by the serial number, so it is one machine. The entry in
    /// <see cref="Umati2DataModel.Namespace"/> is kept, or else the one found first; it takes the
    /// namespaces of the others, and their model if it has none.
    /// </summary>
    internal static IReadOnlyList<FoundMachine> Merge(IReadOnlyList<FoundMachine> machines)
    {
        ArgumentNullException.ThrowIfNull(machines);
        var merged = new List<FoundMachine>();
        foreach (var machine in machines)
        {
            var at = machine.SerialNumber is { Length: > 0 } serial
                ? merged.FindIndex(one => string.Equals(one.SerialNumber, serial, StringComparison.Ordinal))
                : -1;
            if (at < 0)
            {
                merged.Add(machine);
                continue;
            }

            var (kept, other) = Umati2DataModel.Holds(machine.Node) && !Umati2DataModel.Holds(merged[at].Node)
                ? (machine, merged[at])
                : (merged[at], machine);
            merged[at] = kept with
            {
                Model = kept.Model ?? other.Model,
                Manufacturer = kept.Manufacturer ?? other.Manufacturer,
                ProductInstanceUri = kept.ProductInstanceUri ?? other.ProductInstanceUri,
                Namespaces = [.. kept.Namespaces.Concat(other.Namespaces).Distinct(StringComparer.Ordinal)],
            };
        }

        return merged;
    }

    /// <summary>
    /// The namespaces that belong to exactly one of the machines. A namespace two machines have in
    /// common, of a server that does not separate them, says nothing about which machine a node is.
    /// </summary>
    public static IReadOnlyDictionary<string, FoundMachine> OwnerOfNamespace(IReadOnlyList<FoundMachine> machines)
    {
        ArgumentNullException.ThrowIfNull(machines);
        return machines
            .SelectMany(machine => machine.Namespaces.Select(uri => (uri, machine)))
            .GroupBy(pair => pair.uri, StringComparer.Ordinal)
            .Where(group => group.Select(pair => pair.machine.Node).Distinct(StringComparer.Ordinal).Count() == 1)
            .ToDictionary(group => group.Key, group => group.First().machine, StringComparer.Ordinal);
    }

    /// <summary>Reads the identification of each candidate. Null for a candidate without a serial number.</summary>
    internal static async Task<IReadOnlyList<FoundMachine?>> IdentifyAsync(
        IAddressSpace space, List<(string Node, string Path, BrowsedNode Identification)> candidates, CancellationToken cancellationToken)
    {
        if (candidates.Count == 0)
        {
            return [];
        }

        var identifications = await space.ChildrenAsync([.. candidates.Select(one => one.Identification.Node)], cancellationToken).ConfigureAwait(false);
        var toRead = new List<string>();
        var slots = new List<Dictionary<string, int>>();
        foreach (var below in identifications)
        {
            var slot = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var name in Identification)
            {
                if (below.FirstOrDefault(child => !child.IsObject && child.BrowseName == name) is { } variable)
                {
                    slot[name] = toRead.Count;
                    toRead.Add(variable.Node);
                }
            }

            slots.Add(slot);
        }

        var values = toRead.Count == 0 ? [] : await space.ReadTextsAsync(toRead, cancellationToken).ConfigureAwait(false);
        var found = new List<FoundMachine?>();
        for (var index = 0; index < candidates.Count; index++)
        {
            var (node, path, identification) = candidates[index];
            var slot = slots[index];
            if (!slot.TryGetValue("SerialNumber", out var serialSlot))
            {
                found.Add(null);
                continue;
            }

            string? Value(string name) => slot.TryGetValue(name, out var at) && at < values.Count ? values[at] : null;
            var namespaces = new[] { node, identification.Node, toRead[serialSlot] }
                .Select(MachineNamespaces.UriOf)
                .OfType<string>()
                .Where(uri => uri != MachineNamespaces.Base)
                .Distinct(StringComparer.Ordinal)
                .ToList();
            var name = path.Split('/')[^1];
            found.Add(new FoundMachine(
                node,
                path,
                name,
                Value("SerialNumber"),
                Value("Manufacturer"),
                Value("Model"),
                Value("ProductInstanceUri"),
                toRead[serialSlot],
                namespaces));
        }

        return found;
    }
}

/// <summary>The address space of a session of the OPC UA stack, for <see cref="MachineFinder"/>.</summary>
internal sealed class UaAddressSpace(ISession session) : IAddressSpace
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<IReadOnlyList<BrowsedNode>>> ChildrenAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(nodes);
        var result = new List<IReadOnlyList<BrowsedNode>>();
        foreach (var node in nodes)
        {
            if (!MachineConnection.TryResolve(session, node, out var id))
            {
                result.Add([]);
                continue;
            }

            ArrayOf<ReferenceDescription> references;
            try
            {
                (_, _, references) = await session.BrowseAsync(
                    null,
                    null,
                    id,
                    0,
                    BrowseDirection.Forward,
                    ReferenceTypeIds.HierarchicalReferences,
                    true,
                    (uint)(NodeClass.Object | NodeClass.Variable),
                    cancellationToken).ConfigureAwait(false);
            }
            catch (ServiceResultException)
            {
                // A node the server does not know has nothing below it.
                result.Add([]);
                continue;
            }

            var below = new List<BrowsedNode>();
            foreach (var reference in references)
            {
                var child = ExpandedNodeId.ToNodeId(reference.NodeId, session.NamespaceUris);
                if (child.IsNull)
                {
                    continue;
                }

                below.Add(new BrowsedNode(
                    Portable(child, session.NamespaceUris),
                    reference.BrowseName.Name ?? string.Empty,
                    reference.DisplayName.Text ?? reference.BrowseName.Name ?? string.Empty,
                    reference.NodeClass == NodeClass.Object));
            }

            result.Add(below);
        }

        return result;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<string?>> ReadTextsAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(nodes);
        var texts = new List<string?>();
        foreach (var node in nodes)
        {
            if (!MachineConnection.TryResolve(session, node, out var id))
            {
                texts.Add(null);
                continue;
            }

            try
            {
                var value = await session.ReadValueAsync(id, cancellationToken).ConfigureAwait(false);
                texts.Add(value.WrappedValue.AsBoxedObject(Variant.BoxingBehavior.Legacy) switch
                {
                    null => null,
                    LocalizedText text => string.IsNullOrEmpty(text.Text) ? null : text.Text,
                    var other => other.ToString(),
                });
            }
            catch (ServiceResultException)
            {
                texts.Add(null);
            }
        }

        return texts;
    }

    /// <summary>A node with its namespace as a URI, the form a registration keeps.</summary>
    public static string Portable(NodeId node, NamespaceTable namespaces)
    {
        ArgumentNullException.ThrowIfNull(namespaces);
        var text = node.ToString() ?? string.Empty;
        if (node.NamespaceIndex == 0)
        {
            return text;
        }

        var identifier = text.StartsWith("ns=", StringComparison.Ordinal) ? text[(text.IndexOf(';', StringComparison.Ordinal) + 1)..] : text;
        return $"nsu={namespaces.GetString(node.NamespaceIndex)};{identifier}";
    }
}
