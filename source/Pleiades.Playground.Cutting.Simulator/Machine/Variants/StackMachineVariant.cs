using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine.Variants;

/// <summary>
/// What the 2D laser and the punching machine share: a supply stack of sheets and a stack for what the machine
/// makes. When the supply is empty or the other stack full, the machine says so with <c>MaschinenMeldung</c> 2 or 1
/// and waits until the place is available again (<c>LOCAVAIL</c>, or the web page).
/// </summary>
internal abstract class StackMachineVariant : IMachineVariant
{
    public const string SupplyKey = "supply";
    public const string DisposalKey = "disposal";

    public abstract CuttingMachineType Type { get; }

    public abstract IReadOnlyList<StorageLocation> InitialLocations();

    public abstract IReadOnlyList<ProductionOrder> DemoOrders();

    public IReadOnlyList<string> StartNcpTail(ProductionOrder? order) => [];

    public IReadOnlyList<string> EndNcpTail(ProductionOrder? order) => [];

    public Task PlanStateChangedAsync(CuttingLink link, CuttingMachine machine, bool running) => Task.CompletedTask;

    public async Task<string?> PrepareSheetAsync(SheetContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var machine = context.Machine;
        var supply = machine.Location(SupplyKey);
        if (supply is not null && (supply.Locked || supply.Count <= 0))
        {
            if (!supply.Locked)
            {
                machine.UpdateLocation(SupplyKey, l => l with { Locked = true });
                await StackMessageAsync(context, 2, supply).ConfigureAwait(false);
            }

            return "The supply stack is empty.";
        }

        var disposal = machine.Location(DisposalKey);
        if (disposal is not null && (disposal.Locked || (disposal.Capacity > 0 && disposal.Count >= disposal.Capacity)))
        {
            if (!disposal.Locked)
            {
                machine.UpdateLocation(DisposalKey, l => l with { Locked = true });
                await StackMessageAsync(context, 1, disposal).ConfigureAwait(false);
            }

            return "The stack for parts is full.";
        }

        machine.UpdateLocation(SupplyKey, l => l with { Count = l.Count - 1 });
        await LoadAsync(context).ConfigureAwait(false);
        return null;
    }

    public async Task FinishSheetAsync(SheetContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        context.Machine.UpdateLocation(DisposalKey, l => l with { Count = l.Count + 1, StockId = Disposal(context) });
        await UnloadAsync(context).ConfigureAwait(false);
    }

    public virtual IReadOnlyList<IReadOnlyList<string>> PalletStock(CuttingMachine machine) => [];

    public virtual IReadOnlyList<string> PalletSituation(CuttingMachine machine) => [];

    /// <summary>The goods on the parts stack after a sheet.</summary>
    protected virtual string Disposal(SheetContext context) => context.NcProgram;

    /// <summary>Field 2 of <c>MaschinenMeldung</c> for the given message.</summary>
    protected abstract string MessageProgram(SheetContext context, int message);

    protected abstract Task LoadAsync(SheetContext context);

    protected abstract Task UnloadAsync(SheetContext context);

    protected Task MachineMessageAsync(SheetContext context, int message, string positionId = "", string heightId = "")
    {
        ArgumentNullException.ThrowIfNull(context);
        return context.Link.NotifyAsync(CuttingNotifications.MachineMessage,
            context.Machine.MachineNumber,
            MessageProgram(context, message),
            CuttingFormat.Whole(message),
            positionId,
            heightId);
    }

    private Task StackMessageAsync(SheetContext context, int message, StorageLocation location)
    {
        return MachineMessageAsync(context, message,
            CuttingFormat.Whole(location.PositionId), CuttingFormat.Whole(location.HeightId));
    }
}
