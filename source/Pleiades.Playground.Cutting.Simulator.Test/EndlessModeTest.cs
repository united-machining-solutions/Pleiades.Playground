using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Simulator.Machine;
using Pleiades.Playground.Cutting.Simulator.Machine.Variants;

namespace Pleiades.Playground.Cutting.Simulator.Test;

[TestClass]
public sealed class EndlessModeTest
{
    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D, "L-E")]
    [DataRow(CuttingMachineType.Tube, "T-E")]
    [DataRow(CuttingMachineType.Punch, "P-E")]
    public async Task SwitchedOn_WritesOneOrderAfterTheOtherIntoAnEmptyPlan(CuttingMachineType type, string prefix)
    {
        await using var sim = await SimulatorHarness.StartAsync(type);
        await sim.ConnectAsync();

        sim.Machine.SetEndlessMode(true);
        var first = await sim.NotificationAsync(CuttingNotifications.StartNcp);
        var second = await sim.NotificationAsync(CuttingNotifications.StartNcp, n => n.Field(4) != first.Field(4));

        Assert.AreEqual(prefix + "00001", first.Field(4));
        Assert.AreEqual(prefix + "00002", second.Field(4));
        Assert.IsTrue(sim.Machine.Snapshot().Orders.All(o => o.Generated));
    }

    [TestMethod]
    public void StartPlan_WithAnEmptyPlan_IsRefusedWithoutAndAcceptedWithTheEndlessMode()
    {
        var machine = new CuttingMachine(Options.Create(new Config { MachineNumber = "M1", AutoRun = false }), new LaserVariant());
        machine.SetOnline(true);
        var refused = machine.StartPlan();

        machine.SetOnline(false);
        machine.SetEndlessMode(true);
        machine.SetOnline(true);
        var stillStopped = machine.ProductionActive;
        var accepted = machine.StartPlan();
        var job = machine.TakeNextJob();

        Assert.AreEqual(-1, refused);
        Assert.IsFalse(stillStopped, "Without AutoRun the endless mode does not start the plan when the machine switches on.");
        Assert.AreEqual(0, accepted);
        Assert.IsNotNull(job?.OrderSequence);
        Assert.AreEqual("L-E00001", machine.FindOrder(job.OrderSequence.Value)?.Name);
    }

    [TestMethod]
    public async Task AnEmptySupply_IsFilledAfterAWhile_AndTheMachineGoesOn()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Punch);
        await sim.ConnectAsync();
        sim.Machine.UpdateLocation(StackMachineVariant.SupplyKey, l => l with { Count = 0 });

        sim.Machine.SetEndlessMode(true);
        await sim.NotificationAsync(CuttingNotifications.MachineMessage, n => n.Field(3) == "2");
        await sim.NotificationAsync(CuttingNotifications.EndNcp);

        Assert.IsFalse(sim.Machine.Location(StackMachineVariant.SupplyKey)!.Locked);
    }

    [TestMethod]
    public void DoneOrdersOfItsOwn_AreClearedAwayBeyondTheLastTen_OthersStay()
    {
        var machine = new CuttingMachine(Options.Create(new Config { MachineNumber = "M1", AutoRun = false }), new LaserVariant());
        machine.InsertOrder(new ProductionOrder
        {
            Sequence = 0, Name = "MINE", NcProgram = "MY_PROGRAM", Status = CuttingOrderStatus.Completed,
        }, 0);
        machine.SetOnline(true);
        machine.SetEndlessMode(true);

        for (var i = 0; i < 25; i++)
        {
            var job = machine.TakeNextJob();
            Assert.IsNotNull(job?.OrderSequence);
            machine.SetOrderStatus(job.OrderSequence.Value, CuttingOrderStatus.Completed);
        }

        var orders = machine.Snapshot().Orders;
        Assert.AreEqual(11, orders.Count(o => o.Generated), "The last ten done ones, and the one written after them.");
        Assert.IsTrue(orders.Any(o => o.Name == "MINE"), "An order of a person stays.");
        Assert.AreEqual("L-E00025", orders[^1].Name);
        Assert.IsTrue(orders.Where(o => o.Generated).All(o => o.Target is >= 1 and <= 5));
    }

    [TestMethod]
    public void TheEndlessMode_SurvivesARestart()
    {
        var config = Options.Create(new Config { MachineNumber = "M1" });
        var before = new CuttingMachine(config, new PunchVariant());
        before.SetEndlessMode(true);
        before.SetOnline(true);
        var job = before.TakeNextJob();
        before.SetOrderStatus(job!.OrderSequence!.Value, CuttingOrderStatus.Completed);

        var after = new CuttingMachine(config, new PunchVariant());
        after.Import(before.Export());
        after.SetOnline(true);
        after.TakeNextJob();

        Assert.IsTrue(after.EndlessMode);
        Assert.AreEqual("P-E00002", after.Snapshot().Orders[^1].Name);
    }
}
