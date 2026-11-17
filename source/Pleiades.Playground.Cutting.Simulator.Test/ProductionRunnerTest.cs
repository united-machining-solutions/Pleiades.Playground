using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Test;

[TestClass]
public sealed class ProductionRunnerTest
{
    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D)]
    [DataRow(CuttingMachineType.Tube)]
    [DataRow(CuttingMachineType.Punch)]
    public async Task StartPlan_RunsTheOrderToTheEnd(CuttingMachineType type)
    {
        await using var sim = await SimulatorHarness.StartAsync(type);
        await sim.ConnectAsync();
        await AddOrderAsync(sim, "ORDER-A", "PROG_A", 2);

        var start = await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        var first = await sim.NotificationAsync(CuttingNotifications.StartNcp);
        var end = await sim.NotificationAsync(CuttingNotifications.EndNcp, n => n.Field(5) == "2");

        Assert.AreEqual("0", start.Field(3));
        CollectionAssert.AreEqual(new[] { "M1", "PROG_A" }, first.Fields.Take(2).ToArray());
        Assert.AreEqual("ORDER-A", first.Field(4));
        Assert.AreEqual("1", first.Field(5));
        Assert.IsTrue(CuttingFormat.TryParseTimestamp(end.Field(6), out _));
        Assert.IsTrue(int.Parse(end.Field(9), System.Globalization.CultureInfo.InvariantCulture) >= 1, "The gross runtime is in simulated seconds.");
        await sim.NotificationAsync(CuttingNotifications.MachineStopped, n => n.Field(4) == "2");
        await WaitForStatusAsync(sim, "ORDER-A", CuttingOrderStatus.Completed);
    }

    [TestMethod]
    [DataRow(false, DisplayName = "program first")]
    [DataRow(true, DisplayName = "state first")]
    public async Task TheStateAndTheProgramNotification_ComeInTheOrderOfTheSettings(bool stateBeforeProgram)
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D, stateBeforeProgram: stateBeforeProgram);
        await sim.ConnectAsync();
        await AddOrderAsync(sim, "ORDER-A", "PROG_A", 1);

        await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        await sim.NotificationAsync(CuttingNotifications.EndNcp);
        await sim.NotificationAsync(CuttingNotifications.MachineStopped, n => n.Field(4) == "2");

        var names = sim.Received.OfType<CuttingNotification>().Select(n => n.Name).ToList();
        int At(string name) => names.IndexOf(name);
        Assert.AreEqual(stateBeforeProgram, At(CuttingNotifications.MachineRunning) < At(CuttingNotifications.StartNcp));
        Assert.AreEqual(stateBeforeProgram, At(CuttingNotifications.MachineStopped) < At(CuttingNotifications.EndNcp));
    }

    [TestMethod]
    public async Task Tube_CarriesTheAllocationAndTheProfile()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Tube);
        await sim.ConnectAsync();
        sim.Machine.InsertOrder(new Machine.ProductionOrder
        {
            Sequence = 0,
            Name = "T-1",
            NcProgram = "TUBE_1",
            Target = 1,
            MaterialId = "RR40x2",
        }, 0);

        await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        var plan = await sim.NotificationAsync(CuttingNotifications.PlanState);
        var allocation = await sim.NotificationAsync(CuttingNotifications.StartAllocation);
        var start = await sim.NotificationAsync(CuttingNotifications.StartNcp);
        var end = await sim.NotificationAsync(CuttingNotifications.EndNcp);
        await sim.NotificationAsync(CuttingNotifications.EndAllocation);
        var loading = await sim.NotificationAsync(CuttingNotifications.MachineMessage, n => n.Field(3) == "3");

        Assert.AreEqual("1", plan.Field(2));
        Assert.AreEqual("T-1-B", allocation.Field(2));
        Assert.AreEqual("T-1-B", start.Field(10));
        Assert.AreEqual("RR40x2", end.Field(13));
        Assert.AreEqual("T-1-B", end.Field(14));
        Assert.AreEqual("*", loading.Field(2));
        Assert.AreEqual("RR40x2", loading.Field(7));
    }

    [TestMethod]
    public async Task Punch_ReportsAnEmptySupplyAndGoesOnAfterLocationAvailable()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Punch);
        await sim.ConnectAsync();
        sim.Machine.UpdateLocation("supply", l => l with { Count = 0 });
        await AddOrderAsync(sim, "P-1", "PUNCH_1", 1);

        await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        var empty = await sim.NotificationAsync(CuttingNotifications.MachineMessage, n => n.Field(3) == "2");
        var available = await sim.RequestAsync(CuttingCommands.LocationAvailable, "M1", empty.Field(4), empty.Field(5));
        await sim.NotificationAsync(CuttingNotifications.EndNcp);
        var part = await sim.NotificationAsync(CuttingNotifications.PartUnloadFinished);

        CollectionAssert.AreEqual(new[] { "M1", "PUNCH_1", "2", "1", "1" }, empty.Fields.ToArray());
        Assert.AreEqual("0", available.Field(2));
        Assert.AreEqual("P-1-1-1", part.Field(2));
    }

    [TestMethod]
    public async Task AnAlarm_StopsWithAFaultAndListsTheAlarm_AcknowledgeRunsOn()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.ConnectAsync();
        sim.Machine.SetTimeScale(1);
        await AddOrderAsync(sim, "L-1", "LASER_1", 1);
        await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        await sim.NotificationAsync(CuttingNotifications.MachineRunning);

        await sim.Actions.RaiseAlarmAsync(12_345_678, "Nozzle damaged");
        var stopped = await sim.NotificationAsync(CuttingNotifications.MachineStopped, n => n.Field(4) == "1");
        var alarm = await sim.NotificationAsync(CuttingNotifications.CurrentAlarms);
        var refused = await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "LASER_1");
        sim.Machine.SetTimeScale(0.01);
        await sim.Actions.AcknowledgeAlarmsAsync();
        await sim.NotificationAsync(CuttingNotifications.EndNcp);

        var running = sim.Received.OfType<CuttingNotification>().Where(n => n.Name == CuttingNotifications.MachineRunning).ToList();
        Assert.HasCount(2, running, "Once at the start, once when the program runs on.");
        Assert.AreEqual("LASER_1", running[1].Field(2));
        Assert.AreEqual("LASER_1", stopped.Field(2));
        CollectionAssert.AreEqual(new[] { "M1", "12345678", "Nozzle damaged" }, alarm.Fields.Take(3).ToArray());
        Assert.AreEqual("-10", refused.Field(3));
    }

    [TestMethod]
    public async Task AnAlarmWithoutAProgram_Acknowledged_LeavesTheMachineStandingWithoutAFault()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.ConnectAsync();

        await sim.Actions.RaiseAlarmAsync(12_345_678, "Nozzle damaged");
        await sim.NotificationAsync(CuttingNotifications.CurrentAlarms);
        await sim.Actions.AcknowledgeAlarmsAsync();
        var stopped = await sim.NotificationAsync(CuttingNotifications.MachineStopped, n => n.Field(4) == "2");

        Assert.AreEqual(string.Empty, stopped.Field(2), "No program runs.");
        Assert.IsFalse(sim.Machine.HasAlarms);
        Assert.IsFalse(sim.Received.OfType<CuttingNotification>().Any(n => n.Name == CuttingNotifications.MachineRunning),
            "Without a program the machine does not run.");
    }

    [TestMethod]
    public async Task Abort_SendsResetNcpAndTheOrderStaysFree()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.ConnectAsync();
        sim.Machine.SetTimeScale(1);
        await AddOrderAsync(sim, "L-1", "LASER_1", 3);
        await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "*");
        await sim.NotificationAsync(CuttingNotifications.StartNcp);

        sim.Actions.Abort();
        var reset = await sim.NotificationAsync(CuttingNotifications.ResetNcp);

        Assert.AreEqual("L-1", reset.Field(4));
        await WaitForStatusAsync(sim, "L-1", CuttingOrderStatus.Free);
        Assert.AreEqual(0, sim.Machine.Snapshot().Orders.Single().Actual);
    }

    [TestMethod]
    public async Task SingleProgramStart_RunsOnceWithoutAnOrder()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.ConnectAsync();
        sim.Machine.AddPrograms(["LOOSE_PROGRAM"]);

        var unknown = await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "MISSING");
        var start = await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "LOOSE_PROGRAM");
        var started = await sim.NotificationAsync(CuttingNotifications.StartNcp);
        var second = await sim.RequestAsync(CuttingCommands.StartProgram, "M1", "LOOSE_PROGRAM");

        Assert.AreEqual("-1", unknown.Field(3));
        Assert.AreEqual("0", start.Field(3));
        Assert.AreEqual(string.Empty, started.Field(3), "No sequence number outside the plan (§5.1).");
        Assert.AreEqual("1", started.Field(5));
        Assert.AreEqual("-4", second.Field(3), "A program is active.");
    }

    private static async Task AddOrderAsync(SimulatorHarness sim, string name, string program, int target)
    {
        var sequence = sim.Machine.InsertOrder(new Machine.ProductionOrder
        {
            Sequence = 0,
            Name = name,
            NcProgram = program,
            Target = target,
        }, 0);
        Assert.IsGreaterThan(0, sequence);
        await Task.CompletedTask;
    }

    private static async Task WaitForStatusAsync(SimulatorHarness sim, string name, CuttingOrderStatus status)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            if (sim.Machine.Snapshot().Orders.Single(o => o.Name == name).Status == status)
            {
                return;
            }

            await Task.Delay(20);
        }

        Assert.Fail($"The order {name} did not reach {status}.");
    }
}
