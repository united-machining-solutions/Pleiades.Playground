using Pleiades.Playground.OpcUa.Adapter.OpcUa;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Checks that a registration is the machine it says it is, against what its server was found to
/// serve. On a server of several machines, an aggregation server for example, a registration must
/// name its machine, carry the serial number read below it, and take no node of another machine.
/// </summary>
internal static class MachineChecks
{
    /// <summary>The element whose value is the serial number.</summary>
    public const string SerialNumberPath = "Identification.SerialNumber";

    /// <summary>The problems of a registration against the machines of its server. Empty if there are none.</summary>
    /// <param name="registration">The registration.</param>
    /// <param name="machines">The machines the server serves.</param>
    /// <param name="readSerialNumber">The value its element <c>Identification.SerialNumber</c> gave, if it has one.</param>
    public static IReadOnlyList<string> Problems(
        MachineRegistration registration, IReadOnlyList<FoundMachine> machines, string? readSerialNumber)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(machines);
        var problems = new List<string>();

        if (readSerialNumber is not null && !string.Equals(readSerialNumber.Trim(), registration.SerialNumber, StringComparison.Ordinal))
        {
            problems.Add(
                $"serialNumber: the element {SerialNumberPath} reads '{readSerialNumber}', not '{registration.SerialNumber}'. " +
                "Take the serial number as the server gives it.");
        }

        FoundMachine? machine = null;
        if (registration.MachineNode is { Length: > 0 } named)
        {
            machine = machines.FirstOrDefault(one => string.Equals(one.Node, named, StringComparison.Ordinal));
            if (machine is null)
            {
                problems.Add($"machineNode: the server has no machine at {named}. {Listed(machines)}");
            }
            else if (machine.SerialNumber is { } serial && !string.Equals(serial.Trim(), registration.SerialNumber, StringComparison.Ordinal))
            {
                problems.Add(
                    $"serialNumber: the machine at {machine.Path} has the serial number '{serial}', not '{registration.SerialNumber}'.");
            }
        }
        else if (machines.Count > 1)
        {
            // Without its machine named, the nodes are not judged one by one: the person is told
            // which machine they belong to, if they belong to one.
            var of = MachineFinder.OwnerOfNamespace(machines);
            var belongTo = registration.Elements
                .Select(element => MachineNamespaces.UriOf(element.Node) is { } uri && of.TryGetValue(uri, out var owner) ? owner : null)
                .OfType<FoundMachine>()
                .DistinctBy(owner => owner.Node)
                .ToList();
            var hint = belongTo.Count == 1 ? $" Its nodes belong to {belongTo[0].SerialNumber ?? belongTo[0].Path}: machineNode {belongTo[0].Node}." : string.Empty;
            problems.Add($"machineNode: the server serves {machines.Count} machines; name the one this registration is.{hint} {Listed(machines)}");
            return problems;
        }

        // A node in a namespace that only another machine has is a node of that machine. On a server
        // of one machine there is no other one.
        if (machine is null)
        {
            return problems;
        }

        var owners = MachineFinder.OwnerOfNamespace(machines);
        foreach (var element in registration.Elements)
        {
            if (MachineNamespaces.UriOf(element.Node) is { } uri
                && owners.TryGetValue(uri, out var owner)
                && !string.Equals(owner.Node, machine.Node, StringComparison.Ordinal))
            {
                problems.Add($"elements[{element.Area}/{element.Path}]: the node belongs to the machine at {owner.Path} ({owner.SerialNumber ?? "no serial number"}).");
            }
        }

        return problems;
    }

    private static string Listed(IReadOnlyList<FoundMachine> machines) =>
        machines.Count == 0
            ? "The server was found to serve no machine with an Identification."
            : "Machines: " + string.Join("; ", machines.Select(one => $"{one.SerialNumber ?? "?"} at {one.Path} ({one.Node})")) + ".";
}
