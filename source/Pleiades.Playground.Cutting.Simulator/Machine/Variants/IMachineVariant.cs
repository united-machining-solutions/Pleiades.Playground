using Pleiades.Playground.Cutting.Protocol.Model;

namespace Pleiades.Playground.Cutting.Simulator.Machine.Variants;

/// <summary>
/// One run of an NC program, as a variant sees it.
/// </summary>
/// <param name="Machine">The machine.</param>
/// <param name="Link">The way to send notifications.</param>
/// <param name="Order">The order, or <see langword="null"/> for a single program start.</param>
/// <param name="NcProgram">The NC program.</param>
/// <param name="Sheet">The number of the sheet (or tube) in the order, from 1.</param>
internal sealed record SheetContext(CuttingMachine Machine, CuttingLink Link, ProductionOrder? Order, string NcProgram, int Sheet);

/// <summary>
/// What differs between the 2D laser, the tube laser and the punching machine: the stock, what happens around a
/// program run and the fields only one type sends.
/// </summary>
internal interface IMachineVariant
{
    CuttingMachineType Type { get; }

    /// <summary>The stock places of a new machine.</summary>
    IReadOnlyList<StorageLocation> InitialLocations();

    /// <summary>A few orders for a new, empty plan.</summary>
    IReadOnlyList<ProductionOrder> DemoOrders();

    /// <summary>The fields of <c>StartNCP</c> after field 8.</summary>
    IReadOnlyList<string> StartNcpTail(ProductionOrder? order);

    /// <summary>The fields of <c>EndeNCP</c> and <c>ResetNCP</c> after field 11.</summary>
    IReadOnlyList<string> EndNcpTail(ProductionOrder? order);

    /// <summary>The production plan started (true) or stopped (false).</summary>
    Task PlanStateChangedAsync(CuttingLink link, CuttingMachine machine, bool running);

    /// <summary>
    /// Loads the sheet or tube before the program starts. Returns <see langword="null"/> when the program may
    /// start, otherwise what the machine waits for.
    /// </summary>
    Task<string?> PrepareSheetAsync(SheetContext context);

    /// <summary>Unloads after the program ended.</summary>
    Task FinishSheetAsync(SheetContext context);

    /// <summary>The rows of the reply to <c>PALSSHOW</c> (§4.3).</summary>
    IReadOnlyList<IReadOnlyList<string>> PalletStock(CuttingMachine machine);

    /// <summary>The fields of <c>PalletSituation</c> after field 1 (§5.6), four per place.</summary>
    IReadOnlyList<string> PalletSituation(CuttingMachine machine);
}
