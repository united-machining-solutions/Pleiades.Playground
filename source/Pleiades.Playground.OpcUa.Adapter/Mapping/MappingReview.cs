using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>How well an element of the data model is served by a server.</summary>
internal enum MappingState
{
    /// <summary>The node is the element and gives a value.</summary>
    Ok = 0,

    /// <summary>The element is computed from another signal. It works, and a person should know.</summary>
    Derived = 1,

    /// <summary>The match is a guess, or the node gives no value: a person has to look.</summary>
    Unclear = 2,

    /// <summary>The registration does not fit the server: the node is gone, or its value does not fit the element.</summary>
    Mismatch = 3,

    /// <summary>The server does not offer the element.</summary>
    Missing = 4,
}

/// <summary>One line of a mapping review.</summary>
/// <param name="Path">The element.</param>
/// <param name="Area"><c>umati</c> or <c>oem</c>.</param>
/// <param name="State">How well it is served.</param>
/// <param name="Node">The node, if one is mapped.</param>
/// <param name="Detail">Why: the evidence of the match, the reason it is missing, or what is wrong.</param>
/// <param name="Value">The value the node gave last, converted.</param>
/// <param name="Unit">The unit of a number.</param>
internal sealed record MappingRow(
    string Path, string Area, MappingState State, string? Node, string? Detail, object? Value, string? Unit);

/// <summary>How many elements are in each state.</summary>
internal sealed record MappingSummary(int Ok, int Derived, int Unclear, int Mismatch, int Missing)
{
    /// <summary>Whether a person has something to look at before trusting the values.</summary>
    public bool NeedsAttention => Unclear > 0 || Mismatch > 0;
}

/// <summary>What one element gave when its node was read: from a running machine or from a try.</summary>
/// <param name="Area">The area of the element.</param>
/// <param name="Path">The path of the element.</param>
/// <param name="Status"><c>Good</c>, <c>Pending</c>, or what is wrong.</param>
/// <param name="NodeFound">False if the server has no such node.</param>
/// <param name="Value">The converted value.</param>
internal sealed record ElementCheck(string Area, string Path, string Status, bool NodeFound, object? Value);

/// <summary>
/// Sets a registration against what its server gave: which elements are served beyond doubt, which
/// are derived or a guess, which do not fit and which the server does not have. This is what a
/// person reads before saying yes to a registration, and when a machine reports odd values.
/// </summary>
internal static class MappingReview
{
    /// <summary>The lines of the review, what needs a look first.</summary>
    public static IReadOnlyList<MappingRow> Rows(MachineRegistration registration, IReadOnlyList<ElementCheck> checks)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(checks);
        var rows = new List<MappingRow>();
        foreach (var element in registration.Elements)
        {
            var check = checks.FirstOrDefault(one => one.Area == element.Area && one.Path == element.Path);
            var (state, detail) = StateOf(element, check);
            rows.Add(new MappingRow(element.Path, element.Area, state, element.Node, detail, check?.Value, element.Unit));
        }

        foreach (var missing in registration.Missing)
        {
            rows.Add(new MappingRow(missing.Path, "umati", MappingState.Missing, null, missing.Reason, null, null));
        }

        // An element of the core that is neither mapped nor explained is missing all the same.
        foreach (var (path, source) in DataModelProfiles.Core.Elements)
        {
            if (source == ProfileSource.Adapter || rows.Any(row => row.Area == "umati" && row.Path == path))
            {
                continue;
            }

            if (source == ProfileSource.Alerts && registration.Alerts is not null)
            {
                continue;
            }

            var detail = source == ProfileSource.Alerts
                ? "In the core, and the registration subscribes no alarms (alerts): the manifest says it is not available."
                : "In the core, and not mapped: the manifest says it is not available.";
            rows.Add(new MappingRow(path, "umati", MappingState.Missing, null, detail, null, null));
        }

        return [.. rows.OrderBy(row => Order(row.State))];
    }

    /// <summary>The numbers of a review.</summary>
    public static MappingSummary Summary(IReadOnlyList<MappingRow> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);
        int Count(MappingState state) => rows.Count(row => row.State == state);
        return new MappingSummary(
            Count(MappingState.Ok),
            Count(MappingState.Derived),
            Count(MappingState.Unclear),
            Count(MappingState.Mismatch),
            Count(MappingState.Missing));
    }

    private static (MappingState State, string? Detail) StateOf(ElementRegistration element, ElementCheck? check)
    {
        if (check is not null)
        {
            if (!check.NodeFound)
            {
                return (MappingState.Mismatch, $"The server has no such node any more. {check.Status}");
            }

            if (check.Status.StartsWith("NotConvertible", StringComparison.Ordinal))
            {
                return (MappingState.Mismatch, "The value of the node does not fit the kind or the map of the element.");
            }

            if (check.Status is not ("Good" or "Pending"))
            {
                return (MappingState.Unclear, $"The node gives no good value: {check.Status}");
            }
        }

        return element.Match switch
        {
            MatchKind.Unclear => (MappingState.Unclear, element.Evidence ?? "Marked as unclear by the scan, without a reason."),
            MatchKind.Derived => (MappingState.Derived, element.Evidence ?? "Derived from another signal."),
            _ => (MappingState.Ok, element.Evidence),
        };
    }

    // What needs a decision first, what is fine last.
    private static int Order(MappingState state) => state switch
    {
        MappingState.Mismatch => 0,
        MappingState.Unclear => 1,
        MappingState.Derived => 2,
        MappingState.Missing => 3,
        _ => 4,
    };
}

/// <summary>What a new registration changes against the one that is stored.</summary>
/// <param name="Added">Elements that are new.</param>
/// <param name="Removed">Elements that are gone.</param>
/// <param name="Changed">Elements whose node or conversion differs.</param>
/// <param name="ProfilesAdded">Profiles that are new.</param>
/// <param name="ProfilesRemoved">Profiles that are gone.</param>
/// <param name="EndpointChanged">Whether the address or the security differs.</param>
internal sealed record RegistrationChanges(
    IReadOnlyList<string> Added,
    IReadOnlyList<string> Removed,
    IReadOnlyList<string> Changed,
    IReadOnlyList<string> ProfilesAdded,
    IReadOnlyList<string> ProfilesRemoved,
    bool EndpointChanged)
{
    /// <summary>Whether anything differs at all.</summary>
    public bool Any => Added.Count + Removed.Count + Changed.Count + ProfilesAdded.Count + ProfilesRemoved.Count > 0 || EndpointChanged;

    /// <summary>
    /// Compares a new registration with the stored one of the same machine. This is what a scan of
    /// a server that changed comes down to: the profiles and elements it supports now.
    /// </summary>
    public static RegistrationChanges Between(MachineRegistration stored, MachineRegistration proposed)
    {
        ArgumentNullException.ThrowIfNull(stored);
        ArgumentNullException.ThrowIfNull(proposed);
        static string Key(ElementRegistration element) => $"{element.Area}/{element.Path}";
        var before = stored.Elements.ToDictionary(Key, StringComparer.Ordinal);
        var after = proposed.Elements.ToDictionary(Key, StringComparer.Ordinal);
        return new RegistrationChanges(
            [.. after.Keys.Where(key => !before.ContainsKey(key)).Order(StringComparer.Ordinal)],
            [.. before.Keys.Where(key => !after.ContainsKey(key)).Order(StringComparer.Ordinal)],
            [.. after.Where(pair => before.TryGetValue(pair.Key, out var old) && Differs(old, pair.Value)).Select(pair => pair.Key).Order(StringComparer.Ordinal)],
            [.. proposed.Profiles.Except(stored.Profiles, StringComparer.Ordinal)],
            [.. stored.Profiles.Except(proposed.Profiles, StringComparer.Ordinal)],
            stored.Endpoint.Url != proposed.Endpoint.Url
                || stored.Endpoint.SecurityMode != proposed.Endpoint.SecurityMode
                || stored.Endpoint.SecurityPolicy != proposed.Endpoint.SecurityPolicy);
    }

    private static bool Differs(ElementRegistration before, ElementRegistration after) =>
        before.Node != after.Node
        || before.Match != after.Match
        || before.Kind != after.Kind
        || before.Unit != after.Unit
        || before.Scale != after.Scale
        || before.Offset != after.Offset
        || before.MapDefault != after.MapDefault
        || !SameMap(before.Map, after.Map);

    private static bool SameMap(IReadOnlyDictionary<string, string>? before, IReadOnlyDictionary<string, string>? after) =>
        (before is null && after is null)
        || (before is not null && after is not null && before.Count == after.Count
            && before.All(pair => after.TryGetValue(pair.Key, out var value) && value == pair.Value));
}
