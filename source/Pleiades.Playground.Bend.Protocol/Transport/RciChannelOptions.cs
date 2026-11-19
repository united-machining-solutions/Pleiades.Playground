namespace Pleiades.Playground.Bend.Protocol.Transport;

/// <summary>Where the message files of one machine are and how they are named.</summary>
public sealed record RciChannelOptions
{
    /// <summary>The name of the message files of the machine without the running number and <c>.xml</c>.</summary>
    public const string DefaultMachineFilePrefix = "RCIMaschToServ";

    /// <summary>The folder with the message files, shared by machine and host.</summary>
    public required string Directory { get; init; }

    /// <summary>
    /// The name of the message files without the running number and <c>.xml</c>: <c>RCIMaschToServ</c> means
    /// <c>RCIMaschToServ1.xml</c>, <c>RCIMaschToServ2.xml</c>, ...
    /// </summary>
    public string MachineFilePrefix { get; init; } = DefaultMachineFilePrefix;

    /// <summary>The time format of the telegrams: local time of the machine, without an offset.</summary>
    public const string TimestampFormat = "yyyy.MM.dd HH:mm:ss";
}
