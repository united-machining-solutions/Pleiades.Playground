using System.Globalization;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// Answers the requests of the host (§2.5, §3 and §4). A command the machine type does not know is answered
/// with -10, function not possible; a wrong machine number with -11.
/// </summary>
internal sealed class CommandDispatcher(
    CuttingMachine machine,
    MachineActions actions,
    CuttingLink link,
    IOptions<Config> config)
{
    private string MachineNumber => machine.MachineNumber;

    /// <summary>
    /// Answers one request and sends what follows from it.
    /// </summary>
    public async Task HandleAsync(CuttingTelegram request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var (replies, followUp) = Answer(request);
        await link.SendAsync(replies, cancellationToken).ConfigureAwait(false);
        if (followUp is not null)
        {
            await followUp().ConfigureAwait(false);
        }
    }

    /// <summary>
    /// The replies to one request, and what to do after they went out.
    /// </summary>
    internal (IReadOnlyList<CuttingTelegram> Replies, Func<Task>? FollowUp) Answer(CuttingTelegram request)
    {
        var command = request.Command.ToUpperInvariant();
        if (!CuttingSupport.Supports(machine.Type, command))
        {
            return One(request, MachineNumber, CuttingFormat.Whole(CuttingReturnCodes.NotPossibleNow));
        }

        if (command is not (CuttingCommands.Connect or CuttingCommands.Disconnect) &&
            !string.Equals(request.Field(1).Trim(), MachineNumber, StringComparison.Ordinal))
        {
            return One(request, request.Field(1), CuttingFormat.Whole(CuttingReturnCodes.WrongMachineNumber));
        }

        return command switch
        {
            CuttingCommands.Connect => Connect(request),
            CuttingCommands.Disconnect => Disconnect(request),
            CuttingCommands.SplitProgram => One(request, MachineNumber, CuttingFormat.Whole(config.Value.SplitProgramReturnCode)),
            CuttingCommands.InsertOrder => InsertOrder(request),
            CuttingCommands.DeleteOrder => PlanChange(request, machine.DeleteOrders(
                Int(request.Field(2)), request.Field(3), request.Field(4), Int(request.Field(5)) == 1)),
            CuttingCommands.DeleteProgram => One(request, MachineNumber, CuttingFormat.Whole(machine.DeleteProgram(request.Field(2).Trim()))),
            CuttingCommands.ShowPlan => (ShowPlan(request), null),
            CuttingCommands.PlanInfo => PlanInfo(request),
            CuttingCommands.ModifyState => ModifyState(request),
            CuttingCommands.MoveOrder => PlanChange(request, Int(request.Field(4)) is { } position
                ? machine.MoveOrder(request.Field(2), request.Field(3), position)
                : -1),
            CuttingCommands.StartProgram => StartProgram(request),
            CuttingCommands.StopProduction => One(request, MachineNumber,
                CuttingFormat.Whole(Int(request.Field(2)) is { } mode ? actions.Stop(mode) : -3)),
            CuttingCommands.ShowPalletStock => (CuttingReplyBuilder.Table(request, machine.Variant.PalletStock(machine)), null),
            CuttingCommands.SystemTime => One(request, MachineNumber, link.Timestamp, CuttingFormat.Whole(CuttingReturnCodes.Ok)),
            CuttingCommands.SheetLoadAcknowledge => SheetLoadAcknowledge(request),
            // MACHINFO also makes the machine send its feed rate (§6.4).
            CuttingCommands.MachineInfo => (Reply(request, MachineNumber, config.Value.ProductionPlanType,
                CuttingFormat.Whole(machine.Type.MachineInfoCode())), () => actions.SetFeedrateAsync(machine.Feedrate)),
            CuttingCommands.ShowPalletPosition => (Reply(request, MachineNumber, CuttingFormat.Whole(CuttingReturnCodes.Ok)),
                actions.SendPalletChangerPositionAsync),
            CuttingCommands.LocationAvailable => LocationAvailable(request),
            _ => One(request, MachineNumber, CuttingFormat.Whole(CuttingReturnCodes.NotPossibleNow)),
        };
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) Connect(CuttingTelegram request)
    {
        machine.SetHostConnected(true);
        return One(request, [.. CuttingSupport.Commands(machine.Type)]);
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) Disconnect(CuttingTelegram request)
    {
        // The reply goes out first; then the machine stops sending notifications.
        return (Reply(request), () =>
        {
            machine.SetHostConnected(false);
            return Task.CompletedTask;
        });
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) InsertOrder(CuttingTelegram request)
    {
        var status = Int(request.Field(7)) ?? 0;
        if (status is not (0 or 9) || Int(request.Field(5)) is not { } target)
        {
            return One(request, MachineNumber, CuttingFormat.Whole(-9));
        }

        var order = new ProductionOrder
        {
            Sequence = 0,
            Name = request.Field(3).Trim(),
            NcProgram = request.Field(4).Trim(),
            Target = target,
            Actual = Int(request.Field(6)) ?? 0,
            Status = (CuttingOrderStatus)status,
            BlockEnd = request.Field(8).Trim(),
            MaterialId = request.Field(13).Trim(),
            DisposalGroup = request.Field(14).Trim(),
        };
        var result = machine.InsertOrder(order, Int(request.Field(2)) ?? 0);
        return (Reply(request, MachineNumber, CuttingFormat.Whole(result)),
            result > 0 ? actions.PlanChangedAsync : null);
    }

    private IReadOnlyList<CuttingTelegram> ShowPlan(CuttingTelegram request)
    {
        var rows = machine.Snapshot().Orders.Select(o => (IReadOnlyList<string>)
        [
            MachineNumber,
            CuttingFormat.Whole(o.Sequence),
            o.Name,
            o.NcProgram,
            CuttingFormat.Whole(o.Target),
            CuttingFormat.Whole(o.Actual),
            CuttingFormat.Whole((int)o.Status),
            o.BlockEnd,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            o.MaterialId,
            o.DisposalGroup,
            CuttingFormat.Whole(o.RuntimeSeconds),
        ]).ToList();
        return CuttingReplyBuilder.Table(request, rows);
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) PlanInfo(CuttingTelegram request)
    {
        var snapshot = machine.Snapshot();
        var runnable = snapshot.Orders.Where(o => o.IsRunnable).ToList();
        var order = snapshot.Orders.FirstOrDefault(o => o.Sequence == snapshot.CurrentOrder) ?? runnable.FirstOrDefault();
        if (order is null)
        {
            return (Reply(request), null);
        }

        var scale = snapshot.TimeScale;
        static double Remaining(ProductionOrder o) => Math.Max(0, o.Target - o.Actual) * (double)o.RuntimeSeconds;
        var orderEnd = link.Now.AddSeconds(Remaining(order) * scale);
        var planEnd = link.Now.AddSeconds(runnable.Sum(Remaining) * scale);
        return One(request,
            CuttingFormat.Whole(order.Sequence),
            "Production plan",
            MachineNumber,
            CuttingFormat.Timestamp(planEnd),
            CuttingFormat.Timestamp(orderEnd),
            CuttingFormat.Whole(order.RuntimeSeconds),
            CuttingFormat.Whole(order.Target),
            CuttingFormat.Whole(order.Actual));
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) ModifyState(CuttingTelegram request)
    {
        CuttingOrderStatus? status = (Int(request.Field(5)), machine.Type) switch
        {
            (0, _) => CuttingOrderStatus.Free,
            (9, _) => CuttingOrderStatus.Locked,

            // MODSTATE 5 pauses an order of a punching machine; PRD_SHOW then shows 8 (§3.5, §3.7).
            (5, CuttingMachineType.Punch) => CuttingOrderStatus.Paused,
            _ => null,
        };
        if (status is null)
        {
            return One(request, MachineNumber, CuttingFormat.Whole(-4));
        }

        return PlanChange(request, machine.ModifyState(Int(request.Field(2)), request.Field(3), request.Field(4), status.Value));
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) StartProgram(CuttingTelegram request)
    {
        var program = request.Field(2).Trim();
        var result = program == "*" ? actions.StartPlan() : machine.StartSingle(program);
        return One(request, MachineNumber, program, CuttingFormat.Whole(result));
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) SheetLoadAcknowledge(CuttingTelegram request)
    {
        var value = Int(request.Field(2));
        if (value is not (0 or 1 or 3))
        {
            return One(request, MachineNumber, CuttingFormat.Whole(-1));
        }

        machine.SetSheetLoadAcknowledge(value.Value);
        return One(request, MachineNumber, CuttingFormat.Whole(CuttingReturnCodes.Ok));
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) LocationAvailable(CuttingTelegram request)
    {
        var position = Int(request.Field(2));
        var height = Int(request.Field(3)) ?? 0;
        var location = machine.Locations().FirstOrDefault(l =>
            l.Locked && l.PositionId == position && (l.HeightId == height || height == 0));
        if (location is null)
        {
            return One(request, MachineNumber, CuttingFormat.Whole(-1));
        }

        return (Reply(request, MachineNumber, CuttingFormat.Whole(CuttingReturnCodes.Ok)),
            () => actions.MakeAvailableAsync(location.Key));
    }

    private (IReadOnlyList<CuttingTelegram>, Func<Task>?) PlanChange(CuttingTelegram request, int result)
    {
        return (Reply(request, MachineNumber, CuttingFormat.Whole(result)),
            result == CuttingReturnCodes.Ok ? actions.PlanChangedAsync : null);
    }

    private static (IReadOnlyList<CuttingTelegram>, Func<Task>?) One(CuttingTelegram request, params IReadOnlyList<string> fields)
    {
        return (Reply(request, fields), null);
    }

    private static IReadOnlyList<CuttingTelegram> Reply(CuttingTelegram request, params IReadOnlyList<string> fields)
    {
        return [CuttingTelegram.Reply(request, fields)];
    }

    private static int? Int(string value)
    {
        return int.TryParse(value.Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number)
            ? number
            : null;
    }
}
