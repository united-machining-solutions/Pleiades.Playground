namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// Return values that most replies share. Negative values are errors; the meaning of -1 to -9 depends on the
/// command (see the specification of each command).
/// </summary>
public static class CuttingReturnCodes
{
    /// <summary>OK.</summary>
    public const int Ok = 0;

    /// <summary>The function is not possible at the moment.</summary>
    public const int NotPossibleNow = -10;

    /// <summary>Wrong machine number.</summary>
    public const int WrongMachineNumber = -11;
}
