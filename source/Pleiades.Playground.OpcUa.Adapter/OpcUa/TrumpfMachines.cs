namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// How a TRUMPF machine is found where its <c>Machines</c> folder (OPC 40001-1) cannot be browsed,
/// behind an aggregation server that leaves that folder out. Two facts of every TRUMPF machine make
/// it a rule and not a guess:
/// <list type="bullet">
/// <item>The root of its TRUMPF interface is <c>s=1</c> in <c>http://trumpf.com/TRUMPF-Interfaces/</c>,
/// with the display name <c>&lt;Model&gt;.&lt;SerialNumber&gt;</c>, for example <c>TruLaser.A0280O0001</c>.</item>
/// <item>Its MachineTool instance (OPC 40501-1) is <c>i=3000</c> in <c>http://trumpf.com/UA/MachineTool/</c>.</item>
/// </list>
/// A gateway that separates its machines puts a prefix of its own before both namespaces, the same
/// for one machine: <c>urn:A0280O0001:TRUMPF:OpcSimulator/http://trumpf.com/TRUMPF-Interfaces/</c>.
/// </summary>
internal static class TrumpfMachines
{
    /// <summary>The namespace of the TRUMPF interface.</summary>
    public const string Interfaces = "http://trumpf.com/TRUMPF-Interfaces/";

    /// <summary>The namespace of the TRUMPF MachineTool instance.</summary>
    public const string MachineTool = "http://trumpf.com/UA/MachineTool/";

    /// <summary>The identifier of the root of the TRUMPF interface.</summary>
    public const string RootIdentifier = "s=1";

    /// <summary>The identifier of the MachineTool instance.</summary>
    public const string InstanceIdentifier = "i=3000";

    /// <summary>
    /// The prefix a gateway put before the namespaces of the machine, if the node is the root of a
    /// TRUMPF interface; otherwise null. A server of the machine itself has the empty prefix.
    /// </summary>
    public static string? PrefixOfRoot(string node)
    {
        if (MachineNamespacesUri(node) is not { } uri
            || !uri.EndsWith(Interfaces, StringComparison.Ordinal)
            || !node.EndsWith(";" + RootIdentifier, StringComparison.Ordinal))
        {
            return null;
        }

        return uri[..^Interfaces.Length];
    }

    /// <summary>The MachineTool instance of the machine whose namespaces carry this prefix.</summary>
    public static string InstanceOf(string prefix) => $"nsu={prefix}{MachineTool};{InstanceIdentifier}";

    /// <summary>
    /// The model and the serial number in a display name <c>&lt;Model&gt;.&lt;SerialNumber&gt;</c>. The serial
    /// number follows the last dot; a name without a dot is a serial number alone.
    /// </summary>
    public static (string? Model, string? SerialNumber) Split(string? displayName)
    {
        var name = displayName?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return (null, null);
        }

        var dot = name.LastIndexOf('.');
        return dot < 0
            ? (null, name)
            : (dot == 0 ? null : name[..dot], dot == name.Length - 1 ? null : name[(dot + 1)..]);
    }

    /// <summary>
    /// The machines of the TRUMPF roots a browse found. Each is its MachineTool instance with the
    /// identification read below it; the model comes from the display name, as the instance has none.
    /// A root whose instance is not there is listed by its root, with what its display name says.
    /// </summary>
    public static async Task<IReadOnlyList<FoundMachine>> IdentifyAsync(
        IAddressSpace space, IReadOnlyList<(BrowsedNode Root, string Path)> roots, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(space);
        ArgumentNullException.ThrowIfNull(roots);
        if (roots.Count == 0)
        {
            return [];
        }

        var prefixes = roots.Select(root => PrefixOfRoot(root.Root.Node)!).ToList();
        var instances = prefixes.Select(InstanceOf).ToList();
        var below = await space.ChildrenAsync(instances, cancellationToken).ConfigureAwait(false);

        var candidates = new List<(string Node, string Path, BrowsedNode Identification)>();
        var candidateOf = new Dictionary<int, int>();
        for (var index = 0; index < roots.Count; index++)
        {
            if (below[index].FirstOrDefault(child => child.IsObject && child.BrowseName == "Identification") is { } identification)
            {
                candidateOf[index] = candidates.Count;
                candidates.Add((instances[index], roots[index].Path, identification));
            }
        }

        var identified = await MachineFinder.IdentifyAsync(space, candidates, cancellationToken).ConfigureAwait(false);
        var machines = new List<FoundMachine>();
        for (var index = 0; index < roots.Count; index++)
        {
            var (root, path) = roots[index];
            var (model, serialNumber) = Split(root.DisplayName);
            var interfaces = prefixes[index] + Interfaces;
            if (candidateOf.TryGetValue(index, out var at) && identified[at] is { } instance)
            {
                machines.Add(instance with
                {
                    Model = instance.Model ?? model,
                    Namespaces = [.. instance.Namespaces.Append(interfaces).Distinct(StringComparer.Ordinal)],
                });
            }
            else
            {
                machines.Add(new FoundMachine(root.Node, path, root.DisplayName, serialNumber, null, model, null, root.Node, [interfaces]));
            }
        }

        return machines;
    }

    private static string? MachineNamespacesUri(string node) => Registrations.MachineNamespaces.UriOf(node);
}
