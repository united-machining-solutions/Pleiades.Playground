namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// The machine types of the specification. The value is the column of the tables in the specification.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Design", "CA1008:Enums should have zero value",
    Justification = "The values are the columns of the specification, which start at 1.")]
public enum CuttingMachineType
{
    /// <summary>1. 2D laser: flat-bed laser for sheets.</summary>
    Laser2D = 1,

    /// <summary>2. 3D laser.</summary>
    Laser3D = 2,

    /// <summary>3. Tube laser.</summary>
    Tube = 3,

    /// <summary>4. Punching machine, also punch-laser machine.</summary>
    Punch = 4,
}

/// <summary>
/// Codes of the machine types.
/// </summary>
public static class CuttingMachineTypeExtensions
{
    /// <summary>
    /// The machine type as the reply to <c>MACHINFO</c> gives it (§4.6), which counts differently from the
    /// columns: 0 = 2D laser, 1 = punching machine, 2 = 3D laser, 3 = tube laser.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <returns>The code.</returns>
    public static int MachineInfoCode(this CuttingMachineType type)
    {
        return type switch
        {
            CuttingMachineType.Laser2D => 0,
            CuttingMachineType.Punch => 1,
            CuttingMachineType.Laser3D => 2,
            CuttingMachineType.Tube => 3,
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
        };
    }

    /// <summary>
    /// The name to show.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <returns>The name.</returns>
    public static string DisplayName(this CuttingMachineType type)
    {
        return type switch
        {
            CuttingMachineType.Laser2D => "2D laser",
            CuttingMachineType.Laser3D => "3D laser",
            CuttingMachineType.Tube => "Tube laser",
            CuttingMachineType.Punch => "Punching machine",
            _ => type.ToString(),
        };
    }
}
