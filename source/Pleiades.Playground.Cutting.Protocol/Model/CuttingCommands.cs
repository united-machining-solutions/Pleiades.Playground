namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// The commands the host sends (specification §2.5, §3 and §4).
/// </summary>
public static class CuttingCommands
{
    /// <summary>The host connects (§2.5).</summary>
    public const string Connect = "SRC9CONN";

    /// <summary>The host disconnects (§2.5).</summary>
    public const string Disconnect = "SRC9DISC";

    /// <summary>Split a complete file into NC programs (§3.1).</summary>
    public const string SplitProgram = "SPLITPRG";

    /// <summary>Create a production order (§3.2).</summary>
    public const string InsertOrder = "PRDINSER";

    /// <summary>Delete production orders (§3.3).</summary>
    public const string DeleteOrder = "PRDDELET";

    /// <summary>Delete an NC program (§3.4).</summary>
    public const string DeleteProgram = "PRGDELET";

    /// <summary>Show the production plan (§3.5).</summary>
    public const string ShowPlan = "PRD_SHOW";

    /// <summary>Remaining run information of the production plan (§3.6).</summary>
    public const string PlanInfo = "PRD_INFO";

    /// <summary>Change the status of production orders (§3.7).</summary>
    public const string ModifyState = "MODSTATE";

    /// <summary>Move a production order (§3.8).</summary>
    public const string MoveOrder = "PRD_MOVE";

    /// <summary>Start production (§4.1).</summary>
    public const string StartProgram = "PRGSTART";

    /// <summary>Stop production (§4.2).</summary>
    public const string StopProduction = "PRD_STOP";

    /// <summary>Show the pallet stock (§4.3).</summary>
    public const string ShowPalletStock = "PALSSHOW";

    /// <summary>Show the system time (§4.4).</summary>
    public const string SystemTime = "SYSTTIME";

    /// <summary>Acknowledge loading of a sheet at the sheet handler (§4.5).</summary>
    public const string SheetLoadAcknowledge = "SMLDACKN";

    /// <summary>Machine information (§4.6).</summary>
    public const string MachineInfo = "MACHINFO";

    /// <summary>Show the position of the pallet changer (§4.7).</summary>
    public const string ShowPalletPosition = "PALPSHOW";

    /// <summary>A location is available again (§4.8).</summary>
    public const string LocationAvailable = "LOCAVAIL";
}
