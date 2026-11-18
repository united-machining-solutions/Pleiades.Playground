using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>Where the value of an element of a profile comes from.</summary>
internal enum ProfileSource
{
    /// <summary>An element of the registration: a node of the server.</summary>
    Element = 0,

    /// <summary>The adapter publishes it itself, for every machine: the connection.</summary>
    Adapter = 1,

    /// <summary>The alarm subscription of the registration, <c>alerts</c>.</summary>
    Alerts = 2,
}

/// <summary>A profile of the data model: its elements and whether a machine has to deliver it.</summary>
/// <param name="Name">The name of the profile in the specification, for example <c>ChannelMonitoring</c>.</param>
/// <param name="Mandatory">True for <c>Core</c>: every manifest declares it whole, what the machine lacks as not available.</param>
/// <param name="Elements">
/// The paths of its elements as the MQTT binding names them. In a profile with instances, the path
/// below the instance: <c>ChannelState</c> of <c>Channel[1].ChannelState</c>.
/// </param>
/// <param name="InstanceGroup">For a profile with instances: the group before the key, <c>Channel</c> or <c>Consumption.Electricity</c>.</param>
/// <param name="RequiredInstance">The instance the profile cannot do without, <c>Main</c> for a measuring point. Null: any one instance.</param>
internal sealed record ProfileDefinition(
    string Name,
    bool Mandatory,
    IReadOnlyList<(string Path, ProfileSource Source)> Elements,
    string? InstanceGroup = null,
    string? RequiredInstance = null);

/// <summary>Whether a registration delivers a profile, and what it lacks.</summary>
/// <param name="Name">The profile.</param>
/// <param name="Mandatory">True for <c>Core</c>.</param>
/// <param name="Fulfilled">True if every element of the profile is mapped; for a profile with instances, every element of at least one instance.</param>
/// <param name="Offered">True if the registration maps at least one element of the profile.</param>
/// <param name="Missing">The elements that are not mapped. For a profile with instances, those of the instances that are not complete.</param>
/// <param name="Instances">For a profile with instances: the keys of the complete ones, which are published.</param>
internal sealed record ProfileCheck(
    string Name,
    bool Mandatory,
    bool Fulfilled,
    bool Offered,
    IReadOnlyList<string> Missing,
    IReadOnlyList<string> Instances);

/// <summary>
/// The core and the profiles of the data model, after the specification v0.17.0 (§5 and §6), on the
/// paths the MQTT binding of this platform uses today. A machine is added only if it delivers the
/// core whole; the elements of a profile are published only if the profile is complete.
/// </summary>
/// <remarks>
/// The specification is stricter than the binding of version 0.8.0: its core has 13 elements, among
/// them <c>State.Status</c>, which the binding carries as <c>State.MachineryItemState</c> and
/// <c>State.MachineryOperationMode</c>, and <c>Notification.ActiveAlerts</c>, which the binding
/// carries as the alarm events of the subscription in <c>alerts</c>. Profiles of lists and events
/// the binding cannot carry (Components, Stacklight, JobMonitoring, WorkMasterMonitoring and
/// AlertsEvents) are not checked, nor EnergyCompressedAir: its <c>MassFlowRate</c> is in kilogram per
/// second, a unit the binding does not have.
/// </remarks>
internal static class DataModelProfiles
{
    /// <summary>The name of the mandatory profile.</summary>
    public const string CoreName = "Core";

    /// <summary>The version of the specification the profiles follow.</summary>
    public const string SpecificationVersion = "0.17.1";

    /// <summary>The path of the alarms in the core.</summary>
    public const string ActiveAlertsPath = "Notification.ActiveAlerts";

    private const ProfileSource E = ProfileSource.Element;

    /// <summary>The core: every element is mandatory.</summary>
    public static ProfileDefinition Core { get; } = new(CoreName, Mandatory: true,
    [
        ("Identification.Manufacturer", E),
        ("Identification.SerialNumber", E),
        ("Identification.ProductInstanceUri", E),
        ("Identification.ManufacturerUri", E),
        ("Identification.Model", E),
        ("Identification.ProductCode", E),
        ("Identification.YearOfConstruction", E),
        (Topics.ConnectionHeartbeat, ProfileSource.Adapter),
        (Topics.ConnectionState, ProfileSource.Adapter),
        ("State.MachineryItemState", E),
        ("State.MachineryOperationMode", E),
        ("State.FeedOverride", E),
        (ActiveAlertsPath, ProfileSource.Alerts),
        ("OperationCounters.PowerOnDuration", E),
    ]);

    /// <summary>Every profile, the core first.</summary>
    public static IReadOnlyList<ProfileDefinition> All { get; } =
    [
        Core,
        new("IdentificationExtended", false,
        [
            ("Identification.HardwareRevision", E),
            ("Identification.MonthOfConstruction", E),
            ("Identification.InitialOperationDate", E),
            ("Identification.DeviceClass", E),
            ("Identification.AssetId", E),
            ("Identification.ComponentName", E),
            ("Identification.Location", E),
        ]),
        new("MonitoringExtended", false,
        [
            ("OperationCounters.PartsProducedInLifetime", E),
            ("OperationCounters.OperationDuration", E),
            ("State.IsWarmUp", E),
        ]),
        new("ChannelMonitoring", false,
            [("ChannelState", E), ("FeedOverride", E), ("ChannelMode", E), ("RapidOverride", E), ("Name", E)],
            InstanceGroup: "Channel"),
        new("Spindle", false,
            [("IsRotating", E), ("Override", E), ("IsUsedAsAxis", E), ("Name", E)],
            InstanceGroup: "Spindle"),
        new("EnergyElectricity", false,
            [("AcActivePowerTotal", E), ("AcActiveEnergyTotalImportHp", E)],
            InstanceGroup: "Consumption.Electricity",
            RequiredInstance: "Main"),
    ];

    /// <summary>Whether and how far a registration delivers each profile, the core first.</summary>
    public static IReadOnlyList<ProfileCheck> Check(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var mapped = registration.Elements
            .Where(element => element.Area == "umati")
            .Select(element => element.Path)
            .ToHashSet(StringComparer.Ordinal);
        return [.. All.Select(profile => Check(profile, registration, mapped))];
    }

    /// <summary>The check of the core.</summary>
    public static ProfileCheck CoreOf(IReadOnlyList<ProfileCheck> checks)
    {
        ArgumentNullException.ThrowIfNull(checks);
        return checks.First(check => check.Name == CoreName);
    }

    /// <summary>
    /// The registration as it is published: the elements of a profile that is not complete, and of
    /// an instance that is not complete, are taken out and put into <c>missing</c> with the reason;
    /// <c>profiles</c> names the core, which every manifest declares whole (what the machine lacks is
    /// <c>"available": false</c>, as with the other adapters of the stack), and the other profiles that are
    /// complete. An element of the core is never taken out. Elements of no profile, of the maker or of the
    /// binding alone, are kept.
    /// </summary>
    public static MachineRegistration Apply(MachineRegistration registration, out IReadOnlyList<ProfileCheck> checks)
    {
        ArgumentNullException.ThrowIfNull(registration);
        checks = Check(registration);
        var dropped = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (profile, check) in All.Zip(checks))
        {
            if (profile.Mandatory)
            {
                continue;
            }

            foreach (var element in registration.Elements.Where(element => element.Area == "umati"))
            {
                if (Belongs(profile, element.Path, out var instance)
                    && (!check.Fulfilled || (instance is not null && !check.Instances.Contains(instance, StringComparer.Ordinal))))
                {
                    var lacking = check.Missing.Where(path => instance is null || path.StartsWith($"{profile.InstanceGroup}[{instance}].", StringComparison.Ordinal)).ToList();
                    dropped[element.Path] = check.Fulfilled
                        ? $"Not published: the instance {instance} of the profile {profile.Name} is not complete, it lacks {string.Join(", ", lacking)}."
                        : $"Not published: the profile {profile.Name} is not complete, it lacks {string.Join(", ", check.Missing)}.";
                }
            }
        }

        var profiles = checks.Where(check => check.Mandatory || check.Fulfilled).Select(check => check.Name).ToList();
        return registration with
        {
            Profiles = profiles,
            Elements = [.. registration.Elements.Where(element => !(element.Area == "umati" && dropped.ContainsKey(element.Path)))],
            // With an alarm subscription the alarms are not missing, whatever the scan said.
            Missing =
            [
                .. registration.Missing.Where(entry => !dropped.ContainsKey(entry.Path)
                    && !(entry.Path == ActiveAlertsPath && registration.Alerts is not null)),
                .. dropped.Select(pair => new MissingElement { Path = pair.Key, Reason = pair.Value }),
            ],
        };
    }

    /// <summary>Whether a path is an element of a profile, and its instance key if the profile has instances.</summary>
    public static bool Belongs(ProfileDefinition profile, string path, out string? instance)
    {
        ArgumentNullException.ThrowIfNull(profile);
        ArgumentNullException.ThrowIfNull(path);
        instance = null;
        if (profile.InstanceGroup is not { } group)
        {
            return profile.Elements.Any(element => element.Path == path);
        }

        if (!path.StartsWith(group + "[", StringComparison.Ordinal))
        {
            return false;
        }

        var close = path.IndexOf("].", group.Length + 1, StringComparison.Ordinal);
        if (close <= group.Length + 1)
        {
            return false;
        }

        var name = path[(close + 2)..];
        if (!profile.Elements.Any(element => element.Path == name))
        {
            return false;
        }

        instance = path[(group.Length + 1)..close];
        return true;
    }

    private static ProfileCheck Check(ProfileDefinition profile, MachineRegistration registration, HashSet<string> mapped)
    {
        bool Has((string Path, ProfileSource Source) element, string path) => element.Source switch
        {
            ProfileSource.Adapter => true,
            ProfileSource.Alerts => registration.Alerts is not null,
            _ => mapped.Contains(path),
        };

        if (profile.InstanceGroup is not { } group)
        {
            var missing = profile.Elements.Where(element => !Has(element, element.Path)).Select(element => element.Path).ToList();
            var offered = profile.Elements.Any(element => element.Source == ProfileSource.Element && mapped.Contains(element.Path));
            return new ProfileCheck(profile.Name, profile.Mandatory, missing.Count == 0, offered, missing, []);
        }

        var instances = mapped
            .Select(path => Belongs(profile, path, out var key) ? key : null)
            .OfType<string>()
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToList();
        var complete = new List<string>();
        var lacking = new List<string>();
        foreach (var key in instances)
        {
            var absent = profile.Elements
                .Select(element => (element, path: $"{group}[{key}].{element.Path}"))
                .Where(pair => !Has(pair.element, pair.path))
                .Select(pair => pair.path)
                .ToList();
            if (absent.Count == 0)
            {
                complete.Add(key);
            }
            else
            {
                lacking.AddRange(absent);
            }
        }

        var placeholder = profile.RequiredInstance ?? "n";
        if (profile.RequiredInstance is { } required && !complete.Contains(required, StringComparer.Ordinal) && !instances.Contains(required, StringComparer.Ordinal))
        {
            lacking.InsertRange(0, profile.Elements.Select(element => $"{group}[{required}].{element.Path}"));
        }
        else if (instances.Count == 0)
        {
            lacking.AddRange(profile.Elements.Select(element => $"{group}[{placeholder}].{element.Path}"));
        }

        var fulfilled = profile.RequiredInstance is { } needed
            ? complete.Contains(needed, StringComparer.Ordinal)
            : complete.Count > 0;
        return new ProfileCheck(profile.Name, profile.Mandatory, fulfilled, instances.Count > 0, lacking, fulfilled ? complete : []);
    }
}
