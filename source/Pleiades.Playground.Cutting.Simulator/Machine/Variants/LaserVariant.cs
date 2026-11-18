using System.Security.Cryptography;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine.Variants;

/// <summary>
/// A 2D flat-bed laser with a pallet changer and a sheet loader: per sheet it loads (message 3), measures
/// the sheet position, changes the pallet, cuts, and unloads (message 4).
/// </summary>
internal sealed class LaserVariant : StackMachineVariant
{
    private const string MachineKey = "machine";

    public override CuttingMachineType Type => CuttingMachineType.Laser2D;

    public override IReadOnlyList<StorageLocation> InitialLocations() =>
    [
        new()
        {
            Key = SupplyKey, Label = "Pallet changer outer top: raw sheets", Location = 1, PositionId = 1, HeightId = 1,
            GoodsType = "BT", StockId = "*", Count = 20, Capacity = 20, IsSupply = true,
        },
        new()
        {
            Key = MachineKey, Label = "Pallet changer inner: in the machine", Location = 5,
            GoodsType = "BT", StockId = "*", Count = 0, Capacity = 1,
        },
        new()
        {
            Key = DisposalKey, Label = "Pallet changer outer bottom: cut sheets", Location = 9, PositionId = 9, HeightId = 1,
            GoodsType = "NCP", StockId = "*", Count = 0, Capacity = 20,
        },
    ];

    public override IReadOnlyList<ProductionOrder> DemoOrders() =>
    [
        new() { Sequence = 0, Name = "L-1001", NcProgram = "LASER_PART_A", JobName = "JOB-A", Target = 3, MaterialId = "1.0038-3.0", RuntimeSeconds = 45 },
        new() { Sequence = 0, Name = "L-1002", NcProgram = "LASER_PART_B", JobName = "JOB-A", Target = 2, MaterialId = "1.0038-3.0", RuntimeSeconds = 30 },
        new() { Sequence = 0, Name = "L-1003", NcProgram = "LASER_BRACKET", JobName = "JOB-B", Target = 4, MaterialId = "1.4301-2.0", RuntimeSeconds = 55 },
    ];

    public override IReadOnlyList<IReadOnlyList<string>> PalletStock(CuttingMachine machine)
    {
        ArgumentNullException.ThrowIfNull(machine);
        return machine.Locations()
            .Where(l => l.Location > 0)
            .Select(l => (IReadOnlyList<string>)
            [
                machine.MachineNumber, CuttingFormat.Whole(l.Location), l.GoodsType, l.StockId, CuttingFormat.Whole(l.Count),
            ])
            .ToList();
    }

    public override IReadOnlyList<string> PalletSituation(CuttingMachine machine)
    {
        ArgumentNullException.ThrowIfNull(machine);
        return machine.Locations()
            .Where(l => l.Location > 0)
            .SelectMany(l => new[] { CuttingFormat.Whole(l.Location), l.GoodsType, l.StockId, CuttingFormat.Whole(l.Count) })
            .ToList();
    }

    // The 2D laser names the program only when it unloads (§5.4 field 2).
    protected override string MessageProgram(SheetContext context, int message) =>
        message == 4 ? context.NcProgram : string.Empty;

    protected override async Task LoadAsync(SheetContext context)
    {
        var machine = context.Machine;
        var link = context.Link;
        machine.UpdateLocation(MachineKey, l => l with { Count = 1, GoodsType = "BT", StockId = "*" });
        await MachineMessageAsync(context, 3).ConfigureAwait(false);
        await ChangePalletAsync(context).ConfigureAwait(false);
        await link.NotifyAsync(CuttingNotifications.MeasureOffset,
            machine.MachineNumber,
            "0",
            "0",
            CuttingFormat.Whole(RandomNumberGenerator.GetInt32(-500, 501)),
            CuttingFormat.Whole(RandomNumberGenerator.GetInt32(-2000, 2001)),
            CuttingFormat.Whole(RandomNumberGenerator.GetInt32(-2000, 2001)),
            "0").ConfigureAwait(false);
    }

    protected override async Task UnloadAsync(SheetContext context)
    {
        context.Machine.UpdateLocation(MachineKey, l => l with { Count = 0 });
        await ChangePalletAsync(context).ConfigureAwait(false);
        await MachineMessageAsync(context, 4).ConfigureAwait(false);
    }

    private async Task ChangePalletAsync(SheetContext context)
    {
        var machine = context.Machine;
        var position = machine.TogglePalletChanger();
        await context.Link.NotifyAsync(CuttingNotifications.PalletChangerPosition,
            machine.MachineNumber, CuttingFormat.Whole(position)).ConfigureAwait(false);
        await context.Link.NotifyAsync(CuttingNotifications.PalletSituation,
            [machine.MachineNumber, .. PalletSituation(machine)]).ConfigureAwait(false);
    }
}
