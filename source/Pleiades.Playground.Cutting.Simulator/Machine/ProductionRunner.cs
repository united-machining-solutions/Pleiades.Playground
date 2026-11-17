using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Simulator.Machine.Variants;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// Works through the production plan, one program run after the other:
/// <code>
/// load (variant)  →  StartNCP, MaschineLaeuft  →  runtime  →  EndeNCP, MaschineSteht 2, ProdPlanGeaendert
///                                                         →  unload (variant)
/// </code>
/// An alarm halts the runtime until it is acknowledged; an abort sends ResetNCP instead of EndeNCP.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class ProductionRunner(
    CuttingMachine machine,
    CuttingLink link,
    MachineActions actions,
    IOptions<Config> config,
    ILogger<ProductionRunner> logger) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan IdleWait = TimeSpan.FromMilliseconds(500);

    private bool _planRunning;

    private IMachineVariant Variant => machine.Variant;

    private string MachineNumber => machine.MachineNumber;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var job = machine.TakeNextJob();

                // The plan starts by PRGSTART, the web page or AutoRun, and stops in as many ways; the runner
                // sees each change here, between two program runs.
                var running = machine.ProductionActive && machine.Online;
                if (running != _planRunning)
                {
                    _planRunning = running;
                    await Variant.PlanStateChangedAsync(link, machine, running).ConfigureAwait(false);
                }

                if (job is null)
                {
                    await machine.WaitForChangeAsync(IdleWait, stoppingToken).ConfigureAwait(false);
                    continue;
                }

                if (job.OrderSequence is { } sequence)
                {
                    await RunOrderAsync(sequence, stoppingToken).ConfigureAwait(false);
                }
                else
                {
                    await RunSheetAsync(null, job.NcProgram, 1, stoppingToken).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex) when (ex is IOException or InvalidOperationException)
            {
                LogRunFailed(ex);
                await Task.Delay(IdleWait, stoppingToken).ConfigureAwait(false);
            }
        }
    }

    private async Task RunOrderAsync(int sequence, CancellationToken cancellationToken)
    {
        machine.SetCurrentOrder(sequence);
        machine.SetOrderStatus(sequence, CuttingOrderStatus.Active);
        await link.NotifyAsync(CuttingNotifications.PlanChanged, MachineNumber).ConfigureAwait(false);

        try
        {
            while (machine.FindOrder(sequence) is { } order && order.Actual < order.Target &&
                   order.Status == CuttingOrderStatus.Active && machine.Online && machine.ProductionActive)
            {
                var outcome = await RunSheetAsync(order, order.NcProgram, order.Actual + 1, cancellationToken)
                    .ConfigureAwait(false);
                if (outcome != SheetOutcome.Completed)
                {
                    break;
                }
            }
        }
        finally
        {
            var order = machine.FindOrder(sequence);
            if (order is not null)
            {
                machine.SetOrderStatus(sequence,
                    order.Actual >= order.Target ? CuttingOrderStatus.Completed : CuttingOrderStatus.Free);
            }

            machine.EndOrder();
            machine.SetWaiting(string.Empty);
            await link.NotifyAsync(CuttingNotifications.PlanChanged, MachineNumber).ConfigureAwait(false);
        }
    }

    private async Task<SheetOutcome> RunSheetAsync(
        ProductionOrder? order, string program, int sheet, CancellationToken cancellationToken)
    {
        var context = new SheetContext(machine, link, order, program, sheet);

        // Load. When the supply is empty or a stack full, wait until a person or the host makes it available; in
        // endless mode the machine does it itself after a while.
        var waited = TimeSpan.Zero;
        var clock = Stopwatch.StartNew();
        while (await Variant.PrepareSheetAsync(context).ConfigureAwait(false) is { } waitingFor)
        {
            machine.SetWaiting(waitingFor);
            await machine.WaitForChangeAsync(IdleWait, cancellationToken).ConfigureAwait(false);
            if (!machine.Online || !machine.ProductionActive && order is not null)
            {
                machine.SetWaiting(string.Empty);
                return SheetOutcome.Stopped;
            }

            waited += clock.Elapsed / machine.TimeScale;
            clock.Restart();
            if (machine.EndlessMode && !machine.HasAlarms && waited >= config.Value.EndlessRestockAfter)
            {
                await RestockAsync().ConfigureAwait(false);
                waited = TimeSpan.Zero;
            }
        }

        machine.BeginProgram(program, order?.Sequence, sheet);
        await link.SendAsync(InOrder(
            CuttingNotification.Create(CuttingNotifications.StartNcp,
            [
                MachineNumber, program,
                order is null ? string.Empty : CuttingFormat.Whole(order.Sequence),
                order?.Name ?? string.Empty,
                CuttingFormat.Whole(sheet),
                link.Timestamp,
                order?.JobName ?? string.Empty,
                "0",
                .. Variant.StartNcpTail(order),
            ]),
            CuttingNotification.Create(CuttingNotifications.MachineRunning, MachineNumber, program, link.Timestamp)),
            cancellationToken).ConfigureAwait(false);

        var (aborted, gross, halted) = await RunProgramAsync(cancellationToken).ConfigureAwait(false);

        var counted = !aborted && order is not null ? machine.CountSheet(order.Sequence) : order;
        var end = InOrder(
            CuttingNotification.Create(aborted ? CuttingNotifications.ResetNcp : CuttingNotifications.EndNcp,
            [
                MachineNumber, program,
                order is null ? string.Empty : CuttingFormat.Whole(order.Sequence),
                order?.Name ?? string.Empty,
                CuttingFormat.Whole(sheet),
                link.Timestamp,
                order?.JobName ?? string.Empty,
                order?.BatchNumber ?? "*",
                CuttingFormat.Whole((long)gross.TotalSeconds),
                CuttingFormat.Whole((long)(gross - halted).TotalSeconds),
                CuttingFormat.Whole((long)(gross - halted).TotalSeconds),
                .. Variant.EndNcpTail(order),
            ]),
            CuttingNotification.Create(CuttingNotifications.MachineStopped, MachineNumber, program, link.Timestamp, "2"));
        await link.SendAsync(end, cancellationToken).ConfigureAwait(false);

        if (!aborted)
        {
            await Variant.FinishSheetAsync(context with { Order = counted }).ConfigureAwait(false);
        }

        await link.NotifyAsync(CuttingNotifications.PlanChanged, MachineNumber).ConfigureAwait(false);
        var stopMode = machine.EndProgram();

        if (aborted)
        {
            return SheetOutcome.Aborted;
        }

        return stopMode == StopMode.AfterProgram ? SheetOutcome.Stopped : SheetOutcome.Completed;
    }

    /// <summary>
    /// Lets the program run for its runtime. Returns whether it was aborted, the gross runtime and the time it
    /// stood with an alarm, in simulated time.
    /// </summary>
    private async Task<(bool Aborted, TimeSpan Gross, TimeSpan Halted)> RunProgramAsync(CancellationToken cancellationToken)
    {
        var settings = config.Value;
        var min = settings.MinProgramDuration.TotalMilliseconds;
        var max = settings.MaxProgramDuration.TotalMilliseconds;
        var duration = TimeSpan.FromMilliseconds(min + (RandomNumberGenerator.GetInt32(0, 10_001) / 10_000.0 * (max - min)));

        // "done" is the work of the program, which the feed rate speeds up or slows down; "total" is the time
        // that passed, "halted" the part of it with an alarm.
        var done = TimeSpan.Zero;
        var total = TimeSpan.Zero;
        var halted = TimeSpan.Zero;
        var clock = Stopwatch.StartNew();
        while (done < duration)
        {
            await Task.Delay(Tick, cancellationToken).ConfigureAwait(false);
            var elapsed = clock.Elapsed;
            clock.Restart();

            // Real time becomes simulated time; a change of the scale applies from the next tick on.
            var simulated = elapsed / machine.TimeScale;
            total += simulated;
            if (machine.AbortRequested || !machine.Online)
            {
                return (true, total, halted);
            }

            if (machine.HasAlarms)
            {
                halted += simulated;
                continue;
            }

            done += simulated * Math.Max(machine.Feedrate, 1) / 100.0;
            machine.SetProgress(done / duration);
        }

        return (false, total, halted);
    }

    /// <summary>
    /// Fills every empty supply and empties every full stack the machine reported, as an operator would at the web
    /// page; the host learns it from <c>PalletSituation</c>, as after <c>LOCAVAIL</c>.
    /// </summary>
    private async Task RestockAsync()
    {
        foreach (var location in machine.Locations().Where(l => l.Locked))
        {
            LogRestocked(location.Label);
            await actions.MakeAvailableAsync(location.Key).ConfigureAwait(false);
        }
    }

    /// <summary>A program notification and the state that goes with it, in the order the settings ask for.</summary>
    private List<CuttingMessage> InOrder(CuttingNotification program, CuttingNotification state)
    {
        return config.Value.StateBeforeProgram ? [state, program] : [program, state];
    }

    private enum SheetOutcome
    {
        Completed,
        Stopped,
        Aborted,
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "A program run failed; the runner goes on.")]
    private partial void LogRunFailed(Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Endless mode: {Location} is made available again.")]
    private partial void LogRestocked(string location);
}
