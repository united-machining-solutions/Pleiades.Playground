using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// The alarms of a TRUMPF machine that is not in <see cref="Umati2DataModel.Namespace"/>: the events of
/// <c>TcMachineAlarmType</c> (<c>i=1006</c>) of the TRUMPF interface, a subtype of <c>AlarmConditionType</c>,
/// with the code of the maker in its field <c>AlarmIdentifier</c>. Its conditions lie in the namespace of the
/// TRUMPF interface (<c>s=179.BasePlc.5.11.5.4</c>), so that namespace counts as the machine's own
/// (<see cref="MachineNamespaces.Of"/>). A gateway puts its prefix before the namespaces of the machine; the
/// event type is taken with the same prefix as the machine.
/// </summary>
internal static class TrumpfAlarms
{
    /// <summary>The identifier of <c>TcMachineAlarmType</c> in the namespace of the TRUMPF interface.</summary>
    public const string EventTypeIdentifier = "i=1006";

    /// <summary>The field of <c>TcMachineAlarmType</c> that holds the code of the maker.</summary>
    public const string CodeField = "AlarmIdentifier";

    /// <summary>
    /// The registration with <c>alerts</c> set to <c>TcMachineAlarmType</c>, if its machine is a TRUMPF machine
    /// outside <see cref="Umati2DataModel.Namespace"/> (its MachineTool instance or its TRUMPF interface) and it
    /// names no alerts of its own. Any other registration is returned as it is.
    /// </summary>
    public static MachineRegistration Apply(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        if (registration.Alerts is not null
            || Umati2DataModel.NamespaceOf(registration) is not null
            || PrefixOf(registration) is not { } prefix)
        {
            return registration;
        }

        var interfaces = prefix + TrumpfMachines.Interfaces;
        return registration with
        {
            Alerts = new AlertRegistration
            {
                EventType = $"nsu={interfaces};{EventTypeIdentifier}",
                CodeField = $"nsu={interfaces};{CodeField}",
            },
            Missing = [.. registration.Missing.Where(entry => entry.Path != Topics.ActiveAlerts)],
        };
    }

    /// <summary>
    /// The registration without the alerts of <c>TcMachineAlarmType</c> that <see cref="Apply"/> set, moved to
    /// <c>missing</c>: the server turned out not to have the type, or not with the prefix of the machine. Any
    /// other registration is returned as it is.
    /// </summary>
    public static MachineRegistration WithoutEventType(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        if (registration.Alerts is not { List: null, EventType: { } eventType }
            || KnownMappings.NamespaceOf(eventType) is not { } uri
            || !IsInterfaces(uri)
            || !eventType.EndsWith(";" + EventTypeIdentifier, StringComparison.Ordinal))
        {
            return registration;
        }

        return registration with
        {
            Alerts = null,
            Missing =
            [
                .. registration.Missing.Where(entry => entry.Path != Topics.ActiveAlerts),
                new MissingElement { Path = Topics.ActiveAlerts, Reason = $"The server has no TcMachineAlarmType ({EventTypeIdentifier}) in {uri}." },
            ],
        };
    }

    /// <summary>Whether a namespace is that of a TRUMPF interface, with or without the prefix of a gateway.</summary>
    public static bool IsInterfaces(string? uri) => KnownMappings.IsNamespace(uri, TrumpfMachines.Interfaces);

    /// <summary>
    /// The prefix of the namespaces of a TRUMPF machine, from its <c>machineNode</c> or else the node of its serial
    /// number, if that node is in its MachineTool instance or its TRUMPF interface; the empty prefix on a server
    /// of the machine itself. Null for any other machine.
    /// </summary>
    private static string? PrefixOf(MachineRegistration registration)
    {
        var node = registration.MachineNode
            ?? registration.Elements.FirstOrDefault(element => element.Area == "umati" && element.Path == MachineChecks.SerialNumberPath)?.Node;
        var uri = KnownMappings.NamespaceOf(node);
        foreach (var known in (string[])[TrumpfMachines.MachineTool, TrumpfMachines.Interfaces])
        {
            if (KnownMappings.IsNamespace(uri, known))
            {
                return uri![..^known.Length];
            }
        }

        return null;
    }
}
