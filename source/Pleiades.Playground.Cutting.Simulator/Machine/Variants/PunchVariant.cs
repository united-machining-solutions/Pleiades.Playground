using System.Globalization;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine.Variants;

/// <summary>
/// A punching machine with a sheet handler: per sheet it loads (message 3), punches, and the sheet handler unloads
/// the parts one by one (<c>SMPartUnloadFinished</c>). Its stacks have a position and a height ID, which
/// <c>LOCAVAIL</c> names.
/// </summary>
internal sealed class PunchVariant : StackMachineVariant
{
    private const int PartsPerSheet = 3;

    public override CuttingMachineType Type => CuttingMachineType.Punch;

    public override IReadOnlyList<StorageLocation> InitialLocations() =>
    [
        new()
        {
            Key = SupplyKey, Label = "Sheet handler supply stack", PositionId = 1, HeightId = 1,
            GoodsType = "BT", StockId = "*", Count = 15, Capacity = 15, IsSupply = true,
        },
        new()
        {
            Key = DisposalKey, Label = "Parts stack", PositionId = 2, HeightId = 1,
            GoodsType = "NCP", StockId = "*", Count = 0, Capacity = 30,
        },
    ];

    public override IReadOnlyList<ProductionOrder> DemoOrders() =>
    [
        new() { Sequence = 0, Name = "P-3001", NcProgram = "PUNCH_COVER_01", JobName = "JOB-P1", Target = 3, MaterialId = "1.0330-1.5", RuntimeSeconds = 35 },
        new() { Sequence = 0, Name = "P-3002", NcProgram = "PUNCH_PLATE_02", JobName = "JOB-P1", Target = 2, MaterialId = "1.0330-1.5", RuntimeSeconds = 50 },
        new() { Sequence = 0, Name = "P-3003", NcProgram = "PUNCH_HOUSING_03", JobName = "JOB-P2", Target = 2, MaterialId = "1.4301-1.0", RuntimeSeconds = 40 },
    ];

    // The punching machine always names the program (§5.4 field 2).
    protected override string MessageProgram(SheetContext context, int message) => context.NcProgram;

    protected override Task LoadAsync(SheetContext context)
    {
        return MachineMessageAsync(context, 3);
    }

    protected override async Task UnloadAsync(SheetContext context)
    {
        var name = context.Order?.Name ?? context.NcProgram;
        for (var part = 1; part <= PartsPerSheet; part++)
        {
            var partId = string.Create(CultureInfo.InvariantCulture, $"{name}-{context.Sheet}-{part}");
            await context.Link.NotifyAsync(CuttingNotifications.PartUnloadFinished,
                context.Machine.MachineNumber, partId, context.NcProgram, CuttingFormat.Whole(0)).ConfigureAwait(false);
        }
    }
}
