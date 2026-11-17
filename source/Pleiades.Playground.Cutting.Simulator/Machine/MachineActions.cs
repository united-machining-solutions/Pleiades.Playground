using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// What an operator does at the machine, and what follows from it on the wire. The web page and the
/// <see cref="CommandDispatcher"/> both go through here, so that a change always sends the same notifications.
/// </summary>
internal sealed class MachineActions(CuttingMachine machine, CuttingLink link)
{
    public string MachineNumber => machine.MachineNumber;

    // ----- Power ----------------------------------------------------------------------------------------------

    /// <summary>Switches the machine on and announces it (§2.5).</summary>
    public async Task PowerOnAsync()
    {
        machine.SetOnline(true);
        await link.NotifyAsync(CuttingNotifications.ServerConnect).ConfigureAwait(false);
    }

    /// <summary>Announces the shutdown (§2.5) and switches the machine off.</summary>
    public async Task PowerOffAsync()
    {
        await link.NotifyAsync(CuttingNotifications.ServerDisconnect).ConfigureAwait(false);
        machine.SetOnline(false);
    }

    // ----- Alarms and operator messages -----------------------------------------------------------------------

    /// <summary>Raises an alarm: the machine stops with a fault and lists its alarms (§5.9, §5.10).</summary>
    public async Task RaiseAlarmAsync(int number, string text)
    {
        machine.RaiseAlarms([new MachineAlarm(number, text, link.Now)]);
        var snapshot = machine.Snapshot();
        List<CuttingMessage> telegrams =
        [
            CuttingNotification.Create(CuttingNotifications.MachineStopped,
                MachineNumber, snapshot.CurrentProgram, link.Timestamp, "1"),
            .. snapshot.Alarms.Select(a => CuttingNotification.Create(CuttingNotifications.CurrentAlarms,
                MachineNumber, a.Number.ToString("D8", System.Globalization.CultureInfo.InvariantCulture), a.Text,
                CuttingFormat.Timestamp(a.Time))),
        ];
        await link.SendAsync(telegrams, CancellationToken.None).ConfigureAwait(false);
    }

    /// <summary>
    /// Acknowledges all alarms and says how the machine stands then. A program that was running runs on
    /// (<c>MaschineLaeuft</c>, §5.8), which at a real machine takes a press of NC start as well. Without one the
    /// machine stands without a fault (<c>MaschineSteht</c> reason 2, §5.9). The protocol has no notification for an
    /// alarm that goes; a host learns it from this state.
    /// </summary>
    public async Task AcknowledgeAlarmsAsync()
    {
        machine.ClearAlarms();
        var program = machine.Snapshot().CurrentProgram;
        var notification = program.Length > 0
            ? CuttingNotification.Create(CuttingNotifications.MachineRunning, MachineNumber, program, link.Timestamp)
            : CuttingNotification.Create(CuttingNotifications.MachineStopped, MachineNumber, program, link.Timestamp, "2");
        await link.SendAsync([notification], CancellationToken.None).ConfigureAwait(false);
    }

    /// <summary>Turns the feed rate potentiometer (§5.11).</summary>
    public async Task SetFeedrateAsync(int percent)
    {
        machine.SetFeedrate(percent);
        await link.NotifyAsync(CuttingNotifications.Feedrate,
            MachineNumber, CuttingFormat.Whole(machine.Snapshot().Feedrate), link.Timestamp).ConfigureAwait(false);
    }

    /// <summary>Sends a message as an NC program would (§5.12); only the tube adds a timestamp.</summary>
    public Task SendUserMessageAsync(string text)
    {
        var message = CuttingFormat.Sanitize(text);
        message = message.Length > 31 ? message[..31] : message;
        return machine.Type == CuttingMachineType.Tube
            ? link.NotifyAsync(CuttingNotifications.NcUserMessage, MachineNumber, message, link.Timestamp)
            : link.NotifyAsync(CuttingNotifications.NcUserMessage, MachineNumber, message);
    }

    /// <summary>Sends any notification with the given fields.</summary>
    public Task SendNotificationAsync(string name, IReadOnlyList<string> fields)
    {
        return link.NotifyAsync(name, fields);
    }

    /// <summary>Sends the position of the pallet changer (§5.13).</summary>
    public Task SendPalletChangerPositionAsync()
    {
        return link.NotifyAsync(CuttingNotifications.PalletChangerPosition,
            MachineNumber, CuttingFormat.Whole(machine.PalletChangerPosition));
    }

    // ----- Production -----------------------------------------------------------------------------------------

    /// <summary>Starts the plan, as the start button or <c>PRGSTART *</c>.</summary>
    public int StartPlan() => machine.StartPlan();

    /// <summary>Stops production (§4.2 modes 1 and 2).</summary>
    public int Stop(int mode) => machine.RequestStop(mode);

    /// <summary>Aborts the running program; the runner sends <c>ResetNCP</c>.</summary>
    public void Abort() => machine.RequestAbort();

    /// <summary>The plan changed (§5.5).</summary>
    public Task PlanChangedAsync()
    {
        return link.NotifyAsync(CuttingNotifications.PlanChanged, MachineNumber);
    }

    // ----- Production plan from the web page ------------------------------------------------------------------

    public async Task<int> InsertOrderAsync(ProductionOrder order)
    {
        var result = machine.InsertOrder(order, 0);
        if (result > 0)
        {
            await PlanChangedAsync().ConfigureAwait(false);
        }

        return result;
    }

    public async Task<bool> ReplaceOrderAsync(ProductionOrder order)
    {
        var replaced = machine.ReplaceOrder(order);
        if (replaced)
        {
            await PlanChangedAsync().ConfigureAwait(false);
        }

        return replaced;
    }

    public async Task<int> DeleteOrderAsync(int sequence)
    {
        var result = machine.DeleteOrders(sequence, null, null, deletePrograms: false);
        if (result == CuttingReturnCodes.Ok)
        {
            await PlanChangedAsync().ConfigureAwait(false);
        }

        return result;
    }

    public async Task<int> SetOrderStatusAsync(int sequence, CuttingOrderStatus status)
    {
        var result = machine.ModifyState(sequence, null, null, status);
        if (result == CuttingReturnCodes.Ok)
        {
            await PlanChangedAsync().ConfigureAwait(false);
        }

        return result;
    }

    public async Task ShiftOrderAsync(int sequence, int delta)
    {
        machine.Shift(sequence, delta);
        await PlanChangedAsync().ConfigureAwait(false);
    }

    // ----- Stock ----------------------------------------------------------------------------------------------

    /// <summary>
    /// Makes a place available again, as an operator who brings sheets or takes parts away: fills a supply,
    /// empties a stack of parts. <c>LOCAVAIL</c> does the same from the host.
    /// </summary>
    public async Task<StorageLocation?> MakeAvailableAsync(string key)
    {
        var location = machine.UpdateLocation(key, l => l with
        {
            Locked = false,
            Count = l.IsSupply ? Math.Max(l.Capacity, 1) : 0,
        });
        if (location is null)
        {
            return null;
        }

        machine.SetWaiting(string.Empty);
        var situation = machine.Variant.PalletSituation(machine);
        if (situation.Count > 0)
        {
            await link.NotifyAsync(CuttingNotifications.PalletSituation, [MachineNumber, .. situation]).ConfigureAwait(false);
        }

        return location;
    }
}
