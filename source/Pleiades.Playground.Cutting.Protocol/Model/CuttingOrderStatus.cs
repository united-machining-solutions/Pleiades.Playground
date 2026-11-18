namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// The status of a production order in the reply to <c>PRD_SHOW</c> (§3.5). Which values a machine uses
/// depends on its type and configuration.
/// </summary>
public enum CuttingOrderStatus
{
    /// <summary>0: free, the order may run.</summary>
    Free = 0,

    /// <summary>1: no material.</summary>
    NoMaterial = 1,

    /// <summary>2: no unloading.</summary>
    NoUnloading = 2,

    /// <summary>3: no bins.</summary>
    NoBins = 3,

    /// <summary>4: no scrap bin.</summary>
    NoScrapBin = 4,

    /// <summary>5: no staging.</summary>
    NoStaging = 5,

    /// <summary>6: data inconsistency.</summary>
    DataInconsistency = 6,

    /// <summary>7: active, the order runs.</summary>
    Active = 7,

    /// <summary>8: paused (punch) or prepared (3D).</summary>
    Paused = 8,

    /// <summary>9: locked.</summary>
    Locked = 9,

    /// <summary>10: no pallet available.</summary>
    NoPalletAvailable = 10,

    /// <summary>11: table missing.</summary>
    TableMissing = 11,

    /// <summary>12: bin full.</summary>
    BinFull = 12,

    /// <summary>13: not scheduled.</summary>
    NotScheduled = 13,

    /// <summary>14: completed.</summary>
    Completed = 14,

    /// <summary>15: prepared.</summary>
    Prepared = 15,

    /// <summary>16: wrong tube.</summary>
    WrongTube = 16,

    /// <summary>22: reservation error.</summary>
    ReservationError = 22,

    /// <summary>23: user error.</summary>
    UserError = 23,

    /// <summary>24: program error.</summary>
    ProgramError = 24,

    /// <summary>50: faulted, another error.</summary>
    Faulted = 50,
}
