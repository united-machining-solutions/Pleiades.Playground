using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Simulator.Machine;

namespace Pleiades.Playground.Bend.Simulator.Processing;

/// <summary>
/// Runs the automatic processing in the background, one run at a time, and keeps the progress of the last run for
/// the web page. A package whose positions are all finished leaves the production plan.
/// </summary>
internal sealed partial class AutomaticProcessingService(
    SimulatorRuntime runtime,
    MachineBusyState busyState,
    TimeProvider time,
    ILogger<AutomaticProcessingService> logger)
{
    private AutomaticProcessingJob? _lastJob;

    /// <summary>Processes one position.</summary>
    public CommandResult StartPositionProcessing(string packageName, string orderNo, string? reportedBy)
    {
        if (!TryFindPackage(packageName, out var package, out var failure))
        {
            return failure;
        }

        var position = package.ManufacturingOrders
            .FirstOrDefault(order => string.Equals(order.OrderNo, orderNo, StringComparison.Ordinal));
        if (position is null)
        {
            return CommandResult.Failure(CommandError.NotFound, $"Position '{orderNo}' was not found in package '{packageName}'.");
        }

        if (AutomaticPositionProcessor.GetRemainingParts(position) == 0)
        {
            return CommandResult.Failure(CommandError.NothingToProcess, AutomaticPositionProcessor.AlreadyCompletedMessage);
        }

        return StartJob(package, [position], reportedBy);
    }

    /// <summary>
    /// Processes every open position of a package one after another: the telegrams are those of the positions
    /// processed one by one, in the order of the list.
    /// </summary>
    public CommandResult StartPackageProcessing(string packageName, string? reportedBy)
    {
        if (!TryFindPackage(packageName, out var package, out var failure))
        {
            return failure;
        }

        var open = package.ManufacturingOrders.Where(order => AutomaticPositionProcessor.GetRemainingParts(order) != 0).ToArray();
        return open.Length == 0
            ? CommandResult.Failure(CommandError.NothingToProcess, AutomaticPositionProcessor.AlreadyCompletedMessage)
            : StartJob(package, open, reportedBy);
    }

    public CommandResult CancelProcessing()
    {
        var job = Volatile.Read(ref _lastJob);
        if (job is null || !job.IsRunning)
        {
            return CommandResult.Failure(CommandError.NotFound, "No processing is running.");
        }

        job.RequestCancellation();
        return CommandResult.Success("Cancellation requested.");
    }

    public AutomaticProcessingStatusDto GetStatus()
    {
        return Volatile.Read(ref _lastJob)?.CreateStatusSnapshot() ?? AutomaticProcessingStatusDto.Idle();
    }

    private bool TryFindPackage(string packageName, out ProductionPackage package, out CommandResult failure)
    {
        package = runtime.GetProductionPackagesSnapshot()
            .FirstOrDefault(candidate => string.Equals(candidate.ProductionPackageName, packageName, StringComparison.Ordinal))!;
        failure = CommandResult.Failure(CommandError.NotFound, $"Package '{packageName}' not found.");
        return package is not null;
    }

    private CommandResult StartJob(ProductionPackage package, ManufacturingOrder[] positions, string? reportedBy)
    {
        if (!busyState.TryMarkBusy())
        {
            return CommandResult.Failure(CommandError.MachineBusy, "A processing is already running.");
        }

        var job = new AutomaticProcessingJob(package.ProductionPackageName, positions.Length, time);
        Interlocked.Exchange(ref _lastJob, job)?.Dispose();
        _ = Task.Run(() => RunJobAsync(job, package, positions, reportedBy ?? string.Empty), CancellationToken.None);
        return CommandResult.Success($"Processing of '{package.ProductionPackageName}' started.");
    }

    private async Task RunJobAsync(
        AutomaticProcessingJob job,
        ProductionPackage package,
        ManufacturingOrder[] positions,
        string reportedBy)
    {
        try
        {
            for (var index = 0; index < positions.Length; index++)
            {
                // The machine stands idle between two positions, so a host sees the change.
                if (index > 0 && !await AutomaticPositionProcessor.TryWaitAsync(
                        runtime.Config.PositionChangeInterval, job.CancellationToken).ConfigureAwait(false))
                {
                    job.ReportFinished(AutomaticProcessingState.Cancelled, "Processing cancelled.");
                    return;
                }

                var position = positions[index];
                job.ReportPositionStarted(index, position.OrderNo);
                var context = new AutomaticPositionProcessingContext(
                    runtime.Telegrams,
                    runtime.GetProductionPackagesSnapshot(),
                    package,
                    position,
                    reportedBy,
                    runtime.Config.PartFeedbackInterval,
                    job.ReportPartProgress);

                var outcome = await AutomaticPositionProcessor.ProcessPositionAsync(context, job.CancellationToken).ConfigureAwait(false);
                if (outcome == PositionProcessingOutcome.Cancelled)
                {
                    job.ReportFinished(AutomaticProcessingState.Cancelled, "Processing cancelled.");
                    return;
                }

                if (outcome == PositionProcessingOutcome.PackageCompleted)
                {
                    runtime.ProductionPackages.Remove(package);
                    job.ReportFinished(AutomaticProcessingState.Completed,
                        $"Package '{package.ProductionPackageName}' finished and removed from the production plan.");
                    return;
                }

                if (outcome == PositionProcessingOutcome.KitCompleted)
                {
                    // The package is to be made again: it stays in the plan with its positions from 0.
                    job.ReportFinished(AutomaticProcessingState.Completed,
                        $"Package '{package.ProductionPackageName}': {package.ProcessedQuantity} of {package.DesiredQuantity} made, " +
                        "the next run is open.");
                    return;
                }
            }

            job.ReportFinished(AutomaticProcessingState.Completed, "Position(s) processed; the package has open positions left.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            LogProcessingFailed(logger, exception, package.ProductionPackageName);
            job.ReportFinished(AutomaticProcessingState.Failed, exception.Message);
        }
        finally
        {
            busyState.MarkIdle();
            runtime.NotifyChanged();
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Automatic processing of package {PackageName} failed")]
    private static partial void LogProcessingFailed(ILogger logger, Exception exception, string packageName);
}
