namespace Pleiades.Playground.Cutting.Protocol.Model;

/// <summary>
/// What a field holds.
/// </summary>
public enum CuttingFieldKind
{
    /// <summary>Text.</summary>
    Text,

    /// <summary>A whole number.</summary>
    WholeNumber,

    /// <summary>A decimal number with a point.</summary>
    Number,

    /// <summary>A timestamp <c>TT.MM.JJJJ-hh:mm:ss</c>.</summary>
    Timestamp,
}

/// <summary>
/// One field of a notification.
/// </summary>
/// <param name="Number">The 1-based number of the specification.</param>
/// <param name="Name">A short English name.</param>
/// <param name="Kind">What the field holds.</param>
/// <param name="MachineTypes">The machine types that send the field.</param>
public sealed record CuttingFieldDefinition(
    int Number,
    string Name,
    CuttingFieldKind Kind,
    IReadOnlySet<CuttingMachineType> MachineTypes);

/// <summary>
/// One notification of the machine (§5).
/// </summary>
/// <param name="Name">The name between the <c>$$</c>.</param>
/// <param name="Section">The section of the specification.</param>
/// <param name="Description">What it says.</param>
/// <param name="MachineTypes">The machine types that send it.</param>
/// <param name="Fields">The fields, in order.</param>
public sealed record CuttingNotificationDefinition(
    string Name,
    string Section,
    string Description,
    IReadOnlySet<CuttingMachineType> MachineTypes,
    IReadOnlyList<CuttingFieldDefinition> Fields)
{
    /// <summary>
    /// The fields a machine of the given type sends: all fields up to the last one it sends. A field it does
    /// not send but that stands before one it sends stays, empty, so that the numbers keep their place.
    /// </summary>
    /// <param name="type">The machine type.</param>
    /// <returns>The fields.</returns>
    public IReadOnlyList<CuttingFieldDefinition> FieldsFor(CuttingMachineType type)
    {
        var last = Fields.LastOrDefault(f => f.MachineTypes.Contains(type))?.Number ?? 0;
        return Fields.Where(f => f.Number <= last).ToList();
    }
}

/// <summary>
/// The names and fields of the notifications of the machine (§2.5 and §5).
/// </summary>
public static class CuttingNotifications
{
    /// <summary>The machine has started and connects (§2.5).</summary>
    public const string ServerConnect = "src9_server_connect";

    /// <summary>The machine shuts down (§2.5).</summary>
    public const string ServerDisconnect = "src9_server_disconnect";

    /// <summary>An NC program started (§5.1).</summary>
    public const string StartNcp = "StartNCP";

    /// <summary>An NC program ended (§5.2).</summary>
    public const string EndNcp = "EndeNCP";

    /// <summary>An NC program was aborted (§5.3).</summary>
    public const string ResetNcp = "ResetNCP";

    /// <summary>A machine message: loading, unloading, stacks (§5.4).</summary>
    public const string MachineMessage = "MaschinenMeldung";

    /// <summary>The production plan changed (§5.5).</summary>
    public const string PlanChanged = "ProdPlanGeaendert";

    /// <summary>The pallet situation changed (§5.6).</summary>
    public const string PalletSituation = "PalletSituation";

    /// <summary>The machine runs (§5.8).</summary>
    public const string MachineRunning = "MaschineLaeuft";

    /// <summary>The machine stands (§5.9).</summary>
    public const string MachineStopped = "MaschineSteht";

    /// <summary>The current alarms (§5.10).</summary>
    public const string CurrentAlarms = "AktuelleAlarme";

    /// <summary>The feed rate override changed (§5.11).</summary>
    public const string Feedrate = "Feedrate";

    /// <summary>A message of the NC program (§5.12).</summary>
    public const string NcUserMessage = "NCUserMessage";

    /// <summary>The position of the pallet changer (§5.13).</summary>
    public const string PalletChangerPosition = "PalletChangerPos";

    /// <summary>The sheet handler unloaded a part (§5.14).</summary>
    public const string PartUnloadFinished = "SMPartUnloadFinished";

    /// <summary>The result of measuring the sheet position (§5.15).</summary>
    public const string MeasureOffset = "MeasureOffset";

    /// <summary>The production plan runs or stops (§5.16).</summary>
    public const string PlanState = "ProdPlanStat";

    /// <summary>A tube allocation started (§5.17).</summary>
    public const string StartAllocation = "StartBelegung";

    /// <summary>A tube allocation ended (§5.18).</summary>
    public const string EndAllocation = "EndeBelegung";

    private static readonly IReadOnlySet<CuttingMachineType> All = Types(1, 2, 3, 4);

    /// <summary>
    /// Every notification of §5, with its fields.
    /// </summary>
    public static IReadOnlyList<CuttingNotificationDefinition> Definitions { get; } =
    [
        new(StartNcp, "5.1", "NC program started", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "nc_program", CuttingFieldKind.Text, All),
            F(3, "order_sequence_number", CuttingFieldKind.WholeNumber, All),
            F(4, "order_name", CuttingFieldKind.Text, All),
            F(5, "sheet_number", CuttingFieldKind.WholeNumber, All),
            F(6, "timestamp", CuttingFieldKind.Timestamp, All),
            F(7, "job_name", CuttingFieldKind.Text, All),
            F(8, "restart", CuttingFieldKind.WholeNumber, All),
            F(9, "station_number", CuttingFieldKind.WholeNumber, Types(2)),
            F(10, "allocation_name", CuttingFieldKind.Text, Types(3)),
        ]),
        new(EndNcp, "5.2", "NC program ended", All, EndOrResetFields()),
        new(ResetNcp, "5.3", "NC program aborted", All, EndOrResetFields()),
        new(MachineMessage, "5.4", "Machine message: loading, unloading, stacks", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "nc_program", CuttingFieldKind.Text, All),
            F(3, "message_number", CuttingFieldKind.WholeNumber, All),
            F(4, "position_id", CuttingFieldKind.WholeNumber, Types(1, 4)),
            F(5, "height_id", CuttingFieldKind.WholeNumber, Types(1, 4)),
            F(6, "timestamp", CuttingFieldKind.Timestamp, Types(3)),
            F(7, "material_id", CuttingFieldKind.Text, Types(3)),
            F(8, "tube_length_mm", CuttingFieldKind.Number, Types(3)),
            F(9, "tube_diameter_mm", CuttingFieldKind.Number, Types(3)),
            F(10, "batch_number", CuttingFieldKind.Text, Types(3)),
            F(11, "duration_s", CuttingFieldKind.WholeNumber, Types(3)),
        ]),
        new(PlanChanged, "5.5", "Production plan changed", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
        ]),
        new(PalletSituation, "5.6", "Pallet situation changed (repeats fields 2 to 5 per location)", Types(1, 3),
        [
            F(1, "machine_number", CuttingFieldKind.Text, Types(1, 3)),
            F(2, "location", CuttingFieldKind.WholeNumber, Types(1, 3)),
            F(3, "goods_type", CuttingFieldKind.Text, Types(1, 3)),
            F(4, "stock_id", CuttingFieldKind.Text, Types(1, 3)),
            F(5, "stock_count", CuttingFieldKind.WholeNumber, Types(1, 3)),
        ]),
        new(MachineRunning, "5.8", "Machine runs", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "nc_program", CuttingFieldKind.Text, All),
            F(3, "timestamp", CuttingFieldKind.Timestamp, All),
        ]),
        new(MachineStopped, "5.9", "Machine stands; reason 1 = fault, 2 = no fault", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "nc_program", CuttingFieldKind.Text, All),
            F(3, "timestamp", CuttingFieldKind.Timestamp, All),
            F(4, "stop_reason", CuttingFieldKind.WholeNumber, All),
        ]),
        new(CurrentAlarms, "5.10", "A current alarm", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "alarm_number", CuttingFieldKind.WholeNumber, All),
            F(3, "alarm_text", CuttingFieldKind.Text, All),
            F(4, "timestamp", CuttingFieldKind.Timestamp, All),
        ]),
        new(Feedrate, "5.11", "Feed rate override changed, in percent", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "feedrate_percent", CuttingFieldKind.WholeNumber, All),
            F(3, "timestamp", CuttingFieldKind.Timestamp, All),
        ]),
        new(NcUserMessage, "5.12", "Message of the NC program", All,
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "message", CuttingFieldKind.Text, All),
            F(3, "timestamp", CuttingFieldKind.Timestamp, Types(3)),
        ]),
        new(PalletChangerPosition, "5.13", "Pallet changer position: 1-3 both out, 4-6 A in, 7-9 B in", Types(1),
        [
            F(1, "machine_number", CuttingFieldKind.Text, Types(1)),
            F(2, "position", CuttingFieldKind.WholeNumber, Types(1)),
        ]),
        new(PartUnloadFinished, "5.14", "The sheet handler unloaded a part", Types(4),
        [
            F(1, "machine_number", CuttingFieldKind.Text, Types(4)),
            F(2, "part_id", CuttingFieldKind.Text, Types(4)),
            F(3, "nc_program", CuttingFieldKind.Text, Types(4)),
            F(4, "record_number", CuttingFieldKind.WholeNumber, Types(4)),
        ]),
        new(MeasureOffset, "5.15", "Sheet position measured", Types(1),
        [
            F(1, "machine_number", CuttingFieldKind.Text, Types(1)),
            F(2, "x_rotation", CuttingFieldKind.Number, Types(1)),
            F(3, "y_rotation", CuttingFieldKind.Number, Types(1)),
            F(4, "z_rotation_millidegree", CuttingFieldKind.Number, Types(1)),
            F(5, "x_offset_micrometre", CuttingFieldKind.Number, Types(1)),
            F(6, "y_offset_micrometre", CuttingFieldKind.Number, Types(1)),
            F(7, "z_offset", CuttingFieldKind.Number, Types(1)),
        ]),
        new(PlanState, "5.16", "Production plan: 0 = stopped, 1 = runs", Types(3),
        [
            F(1, "machine_number", CuttingFieldKind.Text, Types(3)),
            F(2, "state", CuttingFieldKind.WholeNumber, Types(3)),
            F(3, "timestamp", CuttingFieldKind.Timestamp, Types(3)),
        ]),
        new(StartAllocation, "5.17", "Tube allocation started", Types(3), AllocationFields()),
        new(EndAllocation, "5.18", "Tube allocation ended", Types(3), AllocationFields()),
    ];

    /// <summary>
    /// The definition of a notification.
    /// </summary>
    /// <param name="name">The name.</param>
    /// <returns>The definition or <see langword="null"/>.</returns>
    public static CuttingNotificationDefinition? Find(string name)
    {
        return Definitions.FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.Ordinal));
    }

    private static List<CuttingFieldDefinition> EndOrResetFields()
    {
        return
        [
            F(1, "machine_number", CuttingFieldKind.Text, All),
            F(2, "nc_program", CuttingFieldKind.Text, All),
            F(3, "order_sequence_number", CuttingFieldKind.WholeNumber, All),
            F(4, "order_name", CuttingFieldKind.Text, All),
            F(5, "sheet_number", CuttingFieldKind.WholeNumber, All),
            F(6, "timestamp", CuttingFieldKind.Timestamp, All),
            F(7, "job_name", CuttingFieldKind.Text, All),
            F(8, "batch_number", CuttingFieldKind.Text, All),
            F(9, "gross_runtime_s", CuttingFieldKind.WholeNumber, All),
            F(10, "net_runtime_s", CuttingFieldKind.WholeNumber, All),
            F(11, "net_processing_s", CuttingFieldKind.WholeNumber, All),
            F(12, "station_number", CuttingFieldKind.WholeNumber, Types(2)),
            F(13, "material_id", CuttingFieldKind.Text, Types(3)),
            F(14, "allocation_name", CuttingFieldKind.Text, Types(3)),
        ];
    }

    private static List<CuttingFieldDefinition> AllocationFields()
    {
        var tube = Types(3);
        return
        [
            F(1, "machine_number", CuttingFieldKind.Text, tube),
            F(2, "allocation_name", CuttingFieldKind.Text, tube),
            F(3, "order_name", CuttingFieldKind.Text, tube),
            F(4, "job_name", CuttingFieldKind.Text, tube),
            F(5, "actual_count", CuttingFieldKind.WholeNumber, tube),
            F(6, "timestamp", CuttingFieldKind.Timestamp, tube),
            F(7, "batch_number", CuttingFieldKind.Text, tube),
            F(8, "material_id", CuttingFieldKind.Text, tube),
        ];
    }

    private static CuttingFieldDefinition F(int number, string name, CuttingFieldKind kind, IReadOnlySet<CuttingMachineType> types)
    {
        return new CuttingFieldDefinition(number, name, kind, types);
    }

    internal static IReadOnlySet<CuttingMachineType> Types(params int[] columns)
    {
        return columns.Select(c => (CuttingMachineType)c).ToHashSet();
    }
}
