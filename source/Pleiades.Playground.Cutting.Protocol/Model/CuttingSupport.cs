namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// Which machine type supports which command, from the tables of the specification.
/// </summary>
public static class CuttingSupport
{
    private static readonly Dictionary<string, IReadOnlySet<CuttingMachineType>> CommandTypes = new(StringComparer.Ordinal)
    {
        [CuttingCommands.Connect] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.Disconnect] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.SplitProgram] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.InsertOrder] = CuttingNotifications.Types(1, 4),
        [CuttingCommands.DeleteOrder] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.DeleteProgram] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.ShowPlan] = CuttingNotifications.Types(1, 2, 3, 4),

        // §3.6 marks the request for every type, but only the 2D laser fills the reply.
        [CuttingCommands.PlanInfo] = CuttingNotifications.Types(1),
        [CuttingCommands.ModifyState] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.MoveOrder] = CuttingNotifications.Types(1, 4),
        [CuttingCommands.StartProgram] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.StopProduction] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.ShowPalletStock] = CuttingNotifications.Types(1, 3),
        [CuttingCommands.SystemTime] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.SheetLoadAcknowledge] = CuttingNotifications.Types(4),
        [CuttingCommands.MachineInfo] = CuttingNotifications.Types(1, 2, 3, 4),
        [CuttingCommands.ShowPalletPosition] = CuttingNotifications.Types(1),
        [CuttingCommands.LocationAvailable] = CuttingNotifications.Types(4),
    };

    /// <summary>
    /// Every command, in the order of the specification.
    /// </summary>
    public static IReadOnlyList<string> AllCommands { get; } = [.. CommandTypes.Keys];

    /// <summary>
    /// Whether a machine of the type answers the command.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <param name="command">The command.</param>
    /// <returns>Whether the command is supported.</returns>
    public static bool Supports(CuttingMachineType type, string command)
    {
        return CommandTypes.TryGetValue(command, out var types) && types.Contains(type);
    }

    /// <summary>
    /// The commands a machine of the type answers.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <returns>The commands.</returns>
    public static IReadOnlyList<string> Commands(CuttingMachineType type)
    {
        return AllCommands.Where(c => CommandTypes[c].Contains(type)).ToList();
    }

    /// <summary>
    /// The notifications a machine of the type sends.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <returns>The notifications.</returns>
    public static IReadOnlyList<CuttingNotificationDefinition> Notifications(CuttingMachineType type)
    {
        return CuttingNotifications.Definitions.Where(d => d.MachineTypes.Contains(type)).ToList();
    }
}
