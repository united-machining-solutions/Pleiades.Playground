using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine.Variants;

/// <summary>
/// A tube laser with a tube loader: per tube it starts loading (message 8), ends loading (3), starts the tube
/// allocation, cuts, ends the allocation and unloads (7, 4). It reports whether the plan runs
/// (<c>ProdPlanStat</c>) and carries the allocation and the profile in <c>StartNCP</c> and <c>EndeNCP</c>.
/// </summary>
internal sealed class TubeVariant : IMachineVariant
{
    private const string BundleKey = "bundle";
    private const string MachineKey = "machine";
    private const int LoadingSeconds = 25;
    private const int UnloadingSeconds = 15;

    public CuttingMachineType Type => CuttingMachineType.Tube;

    public IReadOnlyList<StorageLocation> InitialLocations() =>
    [
        new()
        {
            Key = BundleKey, Label = "Bundle support", Location = 20,
            GoodsType = "PR", StockId = "RR40x2-S235", Count = 40, Capacity = 40, IsSupply = true,
        },
        new() { Key = "measure", Label = "Measurement position", Location = 23, GoodsType = "PR", StockId = "*" },
        new() { Key = "gripper", Label = "Gripper", Location = 24, GoodsType = "PR", StockId = "*" },
        new() { Key = MachineKey, Label = "Machine", Location = 30, GoodsType = "PR", StockId = "*", Capacity = 1 },
    ];

    public IReadOnlyList<ProductionOrder> DemoOrders() =>
    [
        new()
        {
            Sequence = 0, Name = "T-2001", NcProgram = "TUBE_RR40X2_01", JobName = "JOB-T1", Target = 3,
            MaterialId = "RR40x2-S235", TubeLength = 6000, TubeDiameter = 40, RuntimeSeconds = 60,
        },
        new()
        {
            Sequence = 0, Name = "T-2002", NcProgram = "TUBE_VK30X30_02", JobName = "JOB-T1", Target = 2,
            MaterialId = "VK30x30x2-S235", TubeLength = 6000, TubeDiameter = 42.4, RuntimeSeconds = 45,
        },
    ];

    // Field 9 is the station of a 3D laser and 0 elsewhere; field 10 the allocation.
    public IReadOnlyList<string> StartNcpTail(ProductionOrder? order) => ["0", order?.AllocationName ?? string.Empty];

    // Field 12 is the station; 13 the profile, 14 the allocation.
    public IReadOnlyList<string> EndNcpTail(ProductionOrder? order) =>
        ["0", order?.MaterialId ?? string.Empty, order?.AllocationName ?? string.Empty];

    public Task PlanStateChangedAsync(CuttingLink link, CuttingMachine machine, bool running)
    {
        ArgumentNullException.ThrowIfNull(link);
        ArgumentNullException.ThrowIfNull(machine);
        return link.NotifyAsync(CuttingNotifications.PlanState, machine.MachineNumber, running ? "1" : "0", link.Timestamp);
    }

    public async Task<string?> PrepareSheetAsync(SheetContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var machine = context.Machine;
        var bundle = machine.Location(BundleKey);
        if (bundle is not null && bundle.Count <= 0)
        {
            machine.UpdateLocation(BundleKey, l => l with { Locked = true });
            return "The bundle support is empty.";
        }

        var material = context.Order?.MaterialId ?? bundle?.StockId ?? string.Empty;
        await TubeMessageAsync(context, 8, string.Empty).ConfigureAwait(false);
        machine.UpdateLocation(BundleKey, l => l with { Count = l.Count - 1, StockId = material });
        machine.UpdateLocation(MachineKey, l => l with { Count = 1, StockId = material });
        await TubeMessageAsync(context, 3, CuttingFormat.Whole(LoadingSeconds)).ConfigureAwait(false);
        await SituationAsync(context).ConfigureAwait(false);
        await AllocationAsync(context, CuttingNotifications.StartAllocation).ConfigureAwait(false);
        return null;
    }

    public async Task FinishSheetAsync(SheetContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        await AllocationAsync(context, CuttingNotifications.EndAllocation).ConfigureAwait(false);
        await TubeMessageAsync(context, 7, string.Empty).ConfigureAwait(false);
        context.Machine.UpdateLocation(MachineKey, l => l with { Count = 0, StockId = "*" });
        await TubeMessageAsync(context, 4, CuttingFormat.Whole(UnloadingSeconds)).ConfigureAwait(false);
        await SituationAsync(context).ConfigureAwait(false);
    }

    public IReadOnlyList<IReadOnlyList<string>> PalletStock(CuttingMachine machine)
    {
        ArgumentNullException.ThrowIfNull(machine);
        return machine.Locations()
            .Select(l => (IReadOnlyList<string>)
            [
                machine.MachineNumber, CuttingFormat.Whole(l.Location), l.GoodsType, l.StockId,
                CuttingFormat.Whole(l.Count), l.BatchNumber,
            ])
            .ToList();
    }

    public IReadOnlyList<string> PalletSituation(CuttingMachine machine)
    {
        ArgumentNullException.ThrowIfNull(machine);
        return machine.Locations()
            .SelectMany(l => new[] { CuttingFormat.Whole(l.Location), l.GoodsType, l.StockId, CuttingFormat.Whole(l.Count) })
            .ToList();
    }

    private static Task SituationAsync(SheetContext context)
    {
        var machine = context.Machine;
        return context.Link.NotifyAsync(CuttingNotifications.PalletSituation,
            [machine.MachineNumber, .. machine.Variant.PalletSituation(machine)]);
    }

    private static Task TubeMessageAsync(SheetContext context, int message, string duration)
    {
        var order = context.Order;
        return context.Link.NotifyAsync(CuttingNotifications.MachineMessage,
            context.Machine.MachineNumber,
            "*",
            CuttingFormat.Whole(message),
            string.Empty,
            string.Empty,
            context.Link.Timestamp,
            order?.MaterialId ?? string.Empty,
            CuttingFormat.Number(order?.TubeLength ?? 0),
            CuttingFormat.Number(order?.TubeDiameter ?? 0),
            order?.BatchNumber ?? "*",
            duration);
    }

    private static Task AllocationAsync(SheetContext context, string name)
    {
        var order = context.Order;
        return context.Link.NotifyAsync(name,
            context.Machine.MachineNumber,
            order?.AllocationName ?? context.NcProgram,
            order?.Name ?? string.Empty,
            order?.JobName ?? string.Empty,
            CuttingFormat.Whole(order?.Actual ?? 0),
            context.Link.Timestamp,
            order?.BatchNumber ?? "*",
            order?.MaterialId ?? string.Empty);
    }
}
