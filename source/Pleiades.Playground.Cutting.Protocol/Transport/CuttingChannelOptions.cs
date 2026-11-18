namespace Pleiades.Playground.Cutting.Protocol.Transport;

/// <summary>
/// Which side of the protocol a channel is.
/// </summary>
public enum CuttingRole
{
    /// <summary>The machine: writes the machine file, reads the host file.</summary>
    Machine,

    /// <summary>The host: writes the host file, reads the machine file.</summary>
    Host,
}

/// <summary>
/// Where the telegram files lie and how a channel waits for them.
/// </summary>
public sealed record CuttingChannelOptions
{
    /// <summary>The default name of the file the machine writes.</summary>
    public const string DefaultMachineFileName = "m1_to_s1.dat";

    /// <summary>The default name of the file the host writes.</summary>
    public const string DefaultHostFileName = "s1_to_m1.dat";

    /// <summary>The folder both sides can read and write.</summary>
    public required string Directory { get; init; }

    /// <summary>Which side this channel is.</summary>
    public required CuttingRole Role { get; init; }

    /// <summary>The file the machine writes.</summary>
    public string MachineFileName { get; init; } = DefaultMachineFileName;

    /// <summary>The file the host writes.</summary>
    public string HostFileName { get; init; } = DefaultHostFileName;

    /// <summary>How long to wait between two looks for a semaphore file to go away.</summary>
    public TimeSpan RetryInterval { get; init; } = TimeSpan.FromMilliseconds(50);

    /// <summary>How long to wait at most for the other side to release a file.</summary>
    public TimeSpan LockTimeout { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>The line break between two telegrams in a file.</summary>
    public string LineBreak { get; init; } = "\r\n";

    /// <summary>The file this side writes.</summary>
    public string OwnFile => Path.Combine(Directory, Role == CuttingRole.Machine ? MachineFileName : HostFileName);

    /// <summary>The file this side reads.</summary>
    public string PeerFile => Path.Combine(Directory, Role == CuttingRole.Machine ? HostFileName : MachineFileName);
}
