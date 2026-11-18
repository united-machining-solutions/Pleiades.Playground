using Pleiades.Playground.Cutting.Protocol.Model;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// One production order in the plan of the machine.
/// </summary>
internal sealed record ProductionOrder
{
    /// <summary>The sequence number in the plan (§3.2 field 2); it stays when the order moves.</summary>
    public required int Sequence { get; init; }

    /// <summary>The name of the order, unique in the plan.</summary>
    public required string Name { get; init; }

    /// <summary>The NC program.</summary>
    public required string NcProgram { get; init; }

    /// <summary>The job (nest) the order belongs to.</summary>
    public string JobName { get; init; } = string.Empty;

    /// <summary>How often the program shall run.</summary>
    public int Target { get; init; } = 1;

    /// <summary>How often it ran.</summary>
    public int Actual { get; init; }

    /// <summary>The status of §3.5.</summary>
    public CuttingOrderStatus Status { get; init; } = CuttingOrderStatus.Free;

    /// <summary>The material: sheet material or tube profile.</summary>
    public string MaterialId { get; init; } = string.Empty;

    /// <summary>The batch number; <c>*</c> when unknown.</summary>
    public string BatchNumber { get; init; } = "*";

    /// <summary>The calculated runtime of one program run, in seconds.</summary>
    public int RuntimeSeconds { get; init; } = 40;

    /// <summary>Block-end mode (§3.2 field 8): empty, 0 or 1.</summary>
    public string BlockEnd { get; init; } = string.Empty;

    /// <summary>The disposal stock group type (§3.2 field 14).</summary>
    public string DisposalGroup { get; init; } = string.Empty;

    /// <summary>The tube length in millimetre (tube only), as the protocol carries it.</summary>
    public double TubeLength { get; init; } = 6000;

    /// <summary>The bounding circle diameter in millimetre (tube only).</summary>
    public double TubeDiameter { get; init; } = 40;

    /// <summary>Whether the endless mode wrote it; only such orders are cleared away when they are done.</summary>
    public bool Generated { get; init; }

    /// <summary>The name of the tube allocation (tube only).</summary>
    public string AllocationName => $"{Name}-B";

    /// <summary>Whether the runner may take the order.</summary>
    public bool IsRunnable => Status is CuttingOrderStatus.Free or CuttingOrderStatus.Active && Actual < Target;
}

/// <summary>
/// A place where material or parts lie: a pallet place (2D laser), a place of the tube loader (tube laser) or a
/// stack of the sheet handler (punching machine).
/// </summary>
internal sealed record StorageLocation
{
    /// <summary>A key for the web page.</summary>
    public required string Key { get; init; }

    /// <summary>What the web page calls it.</summary>
    public required string Label { get; init; }

    /// <summary>The location code of <c>PALSSHOW</c> and <c>PalletSituation</c>; 0 when it has none.</summary>
    public int Location { get; init; }

    /// <summary>The position ID of <c>MaschinenMeldung</c> and <c>LOCAVAIL</c>; 0 when it has none.</summary>
    public int PositionId { get; init; }

    /// <summary>The height ID of <c>MaschinenMeldung</c> and <c>LOCAVAIL</c>.</summary>
    public int HeightId { get; init; }

    /// <summary>The goods: <c>BT</c> sheet, <c>NCP</c> cut sheet, <c>PR</c> tube.</summary>
    public string GoodsType { get; init; } = "BT";

    /// <summary><c>*</c> for sheets, the NC program for cut sheets, the material for tubes.</summary>
    public string StockId { get; init; } = "*";

    /// <summary>How many items lie there.</summary>
    public int Count { get; init; }

    /// <summary>How many items fit; 0 for no limit.</summary>
    public int Capacity { get; init; }

    /// <summary>The batch number.</summary>
    public string BatchNumber { get; init; } = "*";

    /// <summary>Whether it supplies the machine (true) or takes what the machine makes (false).</summary>
    public bool IsSupply { get; init; }

    /// <summary>Whether the machine reported it empty or full and waits until it is available again.</summary>
    public bool Locked { get; init; }
}

/// <summary>An alarm of the machine.</summary>
/// <param name="Number">The eight-digit alarm number.</param>
/// <param name="Text">The text.</param>
/// <param name="Time">When it came.</param>
internal sealed record MachineAlarm(int Number, string Text, DateTime Time);

/// <summary>What the machine does.</summary>
internal enum OperatingState
{
    /// <summary>Switched off: it neither reads nor writes telegrams.</summary>
    Off,

    /// <summary>On and waiting.</summary>
    Idle,

    /// <summary>An NC program runs.</summary>
    Running,

    /// <summary>Waiting for material or for a full stack to be emptied.</summary>
    Waiting,

    /// <summary>Stopped with an alarm.</summary>
    Fault,
}

/// <summary>How production stops (§4.2).</summary>
internal enum StopMode
{
    /// <summary>No stop requested.</summary>
    None = 0,

    /// <summary>Stop after the current NC program.</summary>
    AfterProgram = 1,

    /// <summary>Stop after the current order.</summary>
    AfterOrder = 2,
}

/// <summary>A program run that the runner shall do.</summary>
/// <param name="OrderSequence">The order, or <see langword="null"/> for a single program start.</param>
/// <param name="NcProgram">The NC program.</param>
internal sealed record ProductionJob(int? OrderSequence, string NcProgram);

/// <summary>
/// What the web page and the persistence see: a consistent copy of the state at one moment.
/// </summary>
internal sealed record MachineSnapshot
{
    public required CuttingMachineType Type { get; init; }

    public required string MachineNumber { get; init; }

    public required string DisplayName { get; init; }

    public string SerialNumber { get; init; } = string.Empty;

    public bool Online { get; init; }

    public bool HostConnected { get; init; }

    public OperatingState State { get; init; }

    public bool ProductionActive { get; init; }

    public StopMode StopMode { get; init; }

    public bool AutoRun { get; init; }

    public bool EndlessMode { get; init; }

    public double TimeScale { get; init; }

    public int Feedrate { get; init; }

    public string CurrentProgram { get; init; } = string.Empty;

    public int? CurrentOrder { get; init; }

    public int CurrentSheet { get; init; }

    public double ProgramProgress { get; init; }

    public string WaitingFor { get; init; } = string.Empty;

    public int PalletChangerPosition { get; init; }

    public int SheetLoadAcknowledge { get; init; }

    public IReadOnlyList<ProductionOrder> Orders { get; init; } = [];

    public IReadOnlyList<string> Archive { get; init; } = [];

    public IReadOnlyList<StorageLocation> Locations { get; init; } = [];

    public IReadOnlyList<MachineAlarm> Alarms { get; init; } = [];
}

/// <summary>What survives a restart.</summary>
internal sealed record PersistedState
{
    public int Version { get; init; } = 1;

    public CuttingMachineType Type { get; init; }

    public bool AutoRun { get; init; }

    /// <summary>Null in a file written before the endless mode existed: then the configuration applies.</summary>
    public bool? EndlessMode { get; init; }

    public double TimeScale { get; init; }

    public int Feedrate { get; init; } = 100;

    public int NextSequence { get; init; } = 1;

    public int NextGeneratedNumber { get; init; } = 1;

    public int PalletChangerPosition { get; init; } = 4;

    public List<ProductionOrder> Orders { get; init; } = [];

    public List<string> Archive { get; init; } = [];

    public List<StorageLocation> Locations { get; init; } = [];
}
