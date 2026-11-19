namespace Pleiades.Playground.Bend.Protocol.Model;

/// <summary>
/// The operating state of an <c>OperatingStateFeedback</c> (RCI interface description, chapter 4.2), with the
/// codes of the telegram.
/// </summary>
public enum RciOperatingState
{
    /// <summary>-1, <c>STOERUNG</c>: the machine has a fault; the telegram carries error number and text.</summary>
    Fault = -1,

    /// <summary>0, <c>STEHT</c>: the machine is idle.</summary>
    Idle = 0,

    /// <summary>1, <c>LAEUFT</c>: the machine runs.</summary>
    Running = 1,

    /// <summary>2, <c>WARTUNG</c>: the machine is in maintenance.</summary>
    Maintenance = 2,

    /// <summary>3: the machine is offline.</summary>
    Offline = 3,
}

/// <summary>
/// The status of a manufacturing order, as the telegrams carry it. The names are those of the interface
/// description; the web page of the simulator shows them.
/// </summary>
public enum RciOrderStatus
{
    /// <summary>0: valid, not started.</summary>
    GUELTIG = 0,

    /// <summary>7: active.</summary>
    AKTIV = 7,

    /// <summary>8: disturbed.</summary>
    GESTOERT = 8,

    /// <summary>9: locked.</summary>
    GESPERRT = 9,

    /// <summary>12: paused.</summary>
    PAUSIERT = 12,

    /// <summary>14: finished.</summary>
    FERTIG = 14,
}

/// <summary>The status of a production package in a <c>ProductionPackageFeedback</c>.</summary>
public enum RciPackageStatus
{
    /// <summary>0: valid, not started.</summary>
    GUELTIG = 0,

    /// <summary>7: active.</summary>
    AKTIV = 7,

    /// <summary>8: disturbed.</summary>
    GESTOERT = 8,

    /// <summary>9: locked.</summary>
    GESPERRT = 9,
}

/// <summary>
/// Which run time a <c>ProcessingStarted</c> or <c>ProcessingStopped</c> belongs to, the element <c>Type</c> of the
/// message. The host pairs a start and a stop of the same type like a stopwatch (interface description 5.1).
/// </summary>
public enum RciProcessingTimeType
{
    /// <summary>0: not said.</summary>
    Unknown = 0,

    /// <summary>1, gross run time of the program: starts with the setup, stops with the piece counter of the order.</summary>
    GrossProgramTime = 1,

    /// <summary>2, net run time of the program: starts with the first axis motion of the NC program, stops with a malfunction.</summary>
    NetProgramTime = 2,

    /// <summary>3, net processing time: starts with the first axis motion of the NC program, stops with a feed hold.</summary>
    NetProcessingTime = 3,
}
