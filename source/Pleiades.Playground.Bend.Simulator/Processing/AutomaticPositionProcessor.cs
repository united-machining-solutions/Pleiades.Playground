using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Simulator.ProductionPlan;

namespace Pleiades.Playground.Bend.Simulator.Processing;

/// <summary>What processing one position came to.</summary>
internal enum PositionProcessingOutcome
{
    /// <summary>Position processed; other positions of the package are still open.</summary>
    Processed,

    /// <summary>
    /// Position processed and every position of the package finished: the package was counted up, but is to be made
    /// again; its positions start from 0.
    /// </summary>
    KitCompleted,

    /// <summary>
    /// Position processed and every position of the package finished: the package was counted up and is made as often
    /// as desired.
    /// </summary>
    PackageCompleted,

    /// <summary>The desired number of parts was reached already: nothing was sent.</summary>
    AlreadyCompleted,

    /// <summary>The position is no longer in the production plan.</summary>
    PositionNotInProductionPlan,

    /// <summary>Cancelled.</summary>
    Cancelled,
}

/// <summary>What processing one position needs.</summary>
/// <param name="ProductionPlan">Every package of the machine; the position is looked up there by its order number.</param>
/// <param name="ReportPartProgress">Called after every part feedback with (processed parts, desired parts).</param>
internal sealed record AutomaticPositionProcessingContext(
    RciTelegramWriter Telegrams,
    IReadOnlyList<ProductionPackage> ProductionPlan,
    ProductionPackage ProductionPackage,
    ManufacturingOrder Position,
    string ReportedBy,
    TimeSpan PartFeedbackInterval,
    Action<int, int>? ReportPartProgress);

/// <summary>
/// Processes one position automatically. The feedbacks are those of the machine the former WinForms simulator
/// imitated; the operating states and the end of the processing frame them, so a host sees when the machine runs
/// and when it no longer runs a program:
/// 1. <c>OperatingStateFeedback</c> 1 (running),
/// 2. <c>ProductionPackageFeedback</c> (the processed quantity so far, reported by the operator),
/// 3. <c>ProcessingStarted</c> (status active, type 1),
/// 4. one <c>ManufacturingOrderFeedback</c> per part still open (processed parts counted on, status active),
/// 5. <c>ProcessingStopped</c> (status finished, type 1),
/// 6. <c>ProductionPackageFeedback</c> (processed quantity + 1, reported by nobody), once every position is complete,
/// 7. <c>OperatingStateFeedback</c> 0 (idle).
/// Start and stop are of type 1, the gross run time of the program (interface description 5.1).
/// Cancelled, it ends with <c>ProcessingStopped</c> (status paused) and <c>OperatingStateFeedback</c> 0.
/// Do not change this without aligning it with the host first.
/// </summary>
internal static class AutomaticPositionProcessor
{
    public const string AlreadyCompletedMessage =
        "The desired quantity of the order is already reached; nothing is left to process.";

    /// <summary>How many parts are still open; 0 means the position is complete.</summary>
    public static int GetRemainingParts(ManufacturingOrder position)
    {
        ArgumentNullException.ThrowIfNull(position);
        return position.DesiredNumberOfParts - position.ProcessedParts;
    }

    public static async Task<PositionProcessingOutcome> ProcessPositionAsync(
        AutomaticPositionProcessingContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        var package = context.ProductionPackage;
        package.ReportedBy = context.ReportedBy;

        if (GetRemainingParts(context.Position) == 0)
        {
            return PositionProcessingOutcome.AlreadyCompleted;
        }

        var telegrams = context.Telegrams;
        telegrams.SendOperatingState(RciOperatingState.Running);
        package.ProcessedQuantity = Math.Max(package.ProcessedQuantity, 0);
        telegrams.SendProductionPackageFeedback(package, context.ReportedBy);

        var order = context.ProductionPlan
            .SelectMany(candidate => candidate.ManufacturingOrders)
            .FirstOrDefault(candidate => string.Equals(candidate.OrderNo, context.Position.OrderNo, StringComparison.Ordinal));
        if (order is null)
        {
            telegrams.SendOperatingState(RciOperatingState.Idle);
            return PositionProcessingOutcome.PositionNotInProductionPlan;
        }

        order.Status = RciOrderStatus.AKTIV;

        // The bending program is always that of the part, also for an order of a plan saved before.
        order.ProgramName = DummyProductionDataFactory.ProgramNameFor(order.PartNo);
        telegrams.SendProcessingStarted(package, order, RciProcessingTimeType.GrossProgramTime);

        // A position that was cancelled goes on from the parts it has, not from 1.
        for (var processed = Math.Max(order.ProcessedParts, 0) + 1; processed <= context.Position.DesiredNumberOfParts; processed++)
        {
            order.ProcessedParts = processed;
            telegrams.SendManufacturingOrderFeedback(package, order);
            context.ReportPartProgress?.Invoke(processed, context.Position.DesiredNumberOfParts);

            if (!await TryWaitAsync(context.PartFeedbackInterval, cancellationToken).ConfigureAwait(false))
            {
                StopProcessing(telegrams, package, order, RciOrderStatus.PAUSIERT);
                telegrams.SendOperatingState(RciOperatingState.Idle);
                return PositionProcessingOutcome.Cancelled;
            }
        }

        StopProcessing(telegrams, package, order, RciOrderStatus.FERTIG);
        var outcome = CountUpPackageIfComplete(telegrams, package);
        telegrams.SendOperatingState(RciOperatingState.Idle);
        return outcome;
    }

    /// <summary>Ends the processing of the order: finished or paused. The machine then runs no program of it.</summary>
    private static void StopProcessing(RciTelegramWriter telegrams, ProductionPackage package, ManufacturingOrder order, RciOrderStatus status)
    {
        order.Status = status;
        telegrams.SendProcessingStopped(package, order, RciProcessingTimeType.GrossProgramTime);
    }

    /// <summary>Counts the package up once every position is finished; a kit that is to be made again starts its positions from 0.</summary>
    private static PositionProcessingOutcome CountUpPackageIfComplete(RciTelegramWriter telegrams, ProductionPackage package)
    {
        if (!package.ManufacturingOrders.All(order => order.ProcessedParts == order.DesiredNumberOfParts))
        {
            return PositionProcessingOutcome.Processed;
        }

        package.ProcessedQuantity++;
        telegrams.SendProductionPackageFeedback(package, string.Empty);

        if (package.ProcessedQuantity >= package.DesiredQuantity)
        {
            return PositionProcessingOutcome.PackageCompleted;
        }

        foreach (var order in package.ManufacturingOrders)
        {
            order.ProcessedParts = 0;
            order.Status = RciOrderStatus.GUELTIG;
        }

        return PositionProcessingOutcome.KitCompleted;
    }

    /// <returns>false when cancelled.</returns>
    internal static async Task<bool> TryWaitAsync(TimeSpan interval, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return false;
        }

        if (interval <= TimeSpan.Zero)
        {
            return true;
        }

        try
        {
            await Task.Delay(interval, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
