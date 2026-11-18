using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// An element whose mapping the adapter knows for the instance of a known namespace, so it is not
/// left to the judgement of the scan.
/// </summary>
/// <param name="Namespace">The namespace of the instance: the rule applies when the node of <paramref name="From"/> is in it.</param>
/// <param name="Path">The element the rule sets, in the area <c>umati</c>.</param>
/// <param name="From">The element of the registration whose node <paramref name="Path"/> takes.</param>
/// <param name="Kind">The kind of the value of <paramref name="Path"/>.</param>
/// <param name="Match">How sure the mapping is.</param>
/// <param name="Evidence">Why, for the person who reviews the registration.</param>
internal sealed record KnownMapping(string Namespace, string Path, string From, ValueKind Kind, MatchKind Match, string Evidence);

/// <summary>
/// The mappings the adapter knows for namespaces whose meaning is fixed. Every registration passes
/// through them before it is checked, proposed or stored: an element a rule covers is set by the
/// rule, whatever the scan proposed for it, and is no longer missing. That makes the registration of
/// a known server the same on every scan.
/// </summary>
internal static class KnownMappings
{
    /// <summary>The namespace of the MachineTool instance of a TRUMPF machine.</summary>
    public const string TrumpfMachineTool = "http://trumpf.com/UA/MachineTool/";

    /// <summary>Every rule, in the order it is applied.</summary>
    public static IReadOnlyList<KnownMapping> All { get; } =
    [
        new(
            TrumpfMachineTool,
            "Identification.Model",
            "Identification.SerialNumber",
            ValueKind.Text,
            MatchKind.Derived,
            "Known mapping of the adapter for " + TrumpfMachineTool + ": the instance has no Identification/Model; " +
            "TRUMPF names the machine by Identification/SerialNumber, which is taken as the model."),
    ];

    /// <summary>
    /// The registration with every rule applied whose namespace it names: first the mapping of a
    /// machine in <see cref="Umati2DataModel.Namespace"/>, then <see cref="All"/>. Applying it twice
    /// changes nothing more.
    /// </summary>
    public static MachineRegistration Apply(MachineRegistration registration) => Apply(Umati2DataModel.Apply(registration), All);

    /// <summary>The registration with those of <paramref name="rules"/> applied whose namespace it names.</summary>
    public static MachineRegistration Apply(MachineRegistration registration, IReadOnlyList<KnownMapping> rules)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(rules);
        var elements = registration.Elements.ToList();
        var missing = registration.Missing.ToList();
        foreach (var rule in rules)
        {
            var from = elements.FirstOrDefault(element => element.Area == "umati" && element.Path == rule.From);
            if (from is null || NamespaceOf(from.Node) != rule.Namespace)
            {
                continue;
            }

            var known = new ElementRegistration
            {
                Path = rule.Path,
                Area = "umati",
                Kind = rule.Kind,
                Node = from.Node,
                Match = rule.Match,
                Evidence = rule.Evidence,
            };
            var at = elements.FindIndex(element => element.Area == "umati" && element.Path == rule.Path);
            if (at >= 0)
            {
                elements[at] = known;
            }
            else
            {
                elements.Add(known);
            }

            missing.RemoveAll(entry => entry.Path == rule.Path);
        }

        return registration with { Elements = elements, Missing = missing };
    }

    /// <summary>
    /// Whether <paramref name="uri"/> is the namespace <paramref name="known"/>, as it is or behind the
    /// prefix of a gateway that ends with a slash: <c>urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua</c>.
    /// </summary>
    public static bool IsNamespace(string? uri, string known)
    {
        ArgumentException.ThrowIfNullOrEmpty(known);
        return uri is not null
            && (string.Equals(uri, known, StringComparison.Ordinal)
                || (uri.Length > known.Length
                    && uri.EndsWith(known, StringComparison.Ordinal)
                    && uri[^(known.Length + 1)] == '/'));
    }

    /// <summary>The namespace URI of a node written <c>nsu=&lt;uri&gt;;...</c>, or null for any other form.</summary>
    public static string? NamespaceOf(string? node)
    {
        if (node is null || !node.StartsWith("nsu=", StringComparison.Ordinal))
        {
            return null;
        }

        var separator = node.IndexOf(';', StringComparison.Ordinal);
        return separator > "nsu=".Length ? node["nsu=".Length..separator] : null;
    }
}
