using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Simulator.Test;

[TestClass]
public sealed class CommandDispatcherTest
{
    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D)]
    [DataRow(CuttingMachineType.Tube)]
    [DataRow(CuttingMachineType.Punch)]
    public async Task Connect_ListsTheCommandsOfTheMachineType(CuttingMachineType type)
    {
        await using var sim = await SimulatorHarness.StartAsync(type);

        var reply = await sim.ConnectAsync();

        CollectionAssert.AreEqual(CuttingSupport.Commands(type).ToArray(), reply.Fields.ToArray());
        Assert.IsTrue(sim.Machine.HostConnected);
    }

    [TestMethod]
    public async Task ACommandTheTypeDoesNotKnow_IsAnsweredWithMinus10()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);

        var reply = await sim.RequestAsync(CuttingCommands.LocationAvailable, "M1", "1", "1");

        CollectionAssert.AreEqual(new[] { "M1", "-10" }, reply.Fields.ToArray());
    }

    [TestMethod]
    public async Task AWrongMachineNumber_IsAnsweredWithMinus11()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);

        var reply = await sim.RequestAsync(CuttingCommands.ShowPlan, "OTHER");

        CollectionAssert.AreEqual(new[] { "OTHER", "-11" }, reply.Fields.ToArray());
    }

    [TestMethod]
    public async Task ShowPlan_AnEmptyPlan_IsAReplyOfThirtyCharacters()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Tube);

        var reply = await sim.RequestAsync(CuttingCommands.ShowPlan, "M1");

        Assert.AreEqual(30, reply.Format().Length);
    }

    [TestMethod]
    public async Task InsertOrder_ThenShowPlan_ShowsTheOrderWithItsSequenceNumber()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);

        var insert = await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "17", "ORDER-A", "PROG_A", "5", "0", "0");
        var plan = await sim.RequestAsync(CuttingCommands.ShowPlan, "M1");

        CollectionAssert.AreEqual(new[] { "M1", "17" }, insert.Fields.ToArray());
        Assert.AreEqual(15, plan.Columns);
        Assert.AreEqual(1, plan.Rows);
        CollectionAssert.AreEqual(
            new[] { "M1", "17", "ORDER-A", "PROG_A", "5", "0", "0" },
            plan.Fields.Take(7).ToArray());
    }

    [TestMethod]
    public async Task InsertOrder_TwiceWithTheSameName_IsAnsweredWithMinus3()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Punch);

        await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "ORDER-A", "PROG_A", "1", "0", "0");
        var again = await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "ORDER-A", "PROG_B", "1", "0", "0");

        Assert.AreEqual("-3", again.Field(2));
    }

    [TestMethod]
    public async Task ModifyState_PauseOnAPunch_ShowsStatus8()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Punch);
        await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "ORDER-A", "PROG_A", "1", "0", "9");

        var pause = await sim.RequestAsync(CuttingCommands.ModifyState, "M1", "", "ORDER-A", "", "5");
        var plan = await sim.RequestAsync(CuttingCommands.ShowPlan, "M1");

        Assert.AreEqual("0", pause.Field(2));
        Assert.AreEqual("8", plan.Field(7));
    }

    [TestMethod]
    public async Task ModifyState_PauseOnALaser_IsAnInvalidParameter()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "ORDER-A", "PROG_A", "1", "0", "9");

        var pause = await sim.RequestAsync(CuttingCommands.ModifyState, "M1", "", "ORDER-A", "", "5");

        Assert.AreEqual("-4", pause.Field(2));
    }

    [TestMethod]
    public async Task DeleteOrder_MinusOne_EmptiesThePlan()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "A", "PROG_A", "1", "0", "9");
        await sim.RequestAsync(CuttingCommands.InsertOrder, "M1", "", "B", "PROG_B", "1", "0", "9");

        var delete = await sim.RequestAsync(CuttingCommands.DeleteOrder, "M1", "-1");

        Assert.AreEqual("0", delete.Field(2));
        Assert.IsEmpty(sim.Machine.Snapshot().Orders);
    }

    [TestMethod]
    public async Task MachineInfo_GivesTheTypeCodeOfParagraph46()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Tube);

        var reply = await sim.RequestAsync(CuttingCommands.MachineInfo, "M1");

        Assert.AreEqual("3", reply.Field(3));
    }

    [TestMethod]
    public async Task SystemTime_GivesATimestamp()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Punch);

        var reply = await sim.RequestAsync(CuttingCommands.SystemTime, "M1");

        Assert.IsTrue(CuttingFormat.TryParseTimestamp(reply.Field(2), out _));
        Assert.AreEqual("0", reply.Field(3));
    }

    [TestMethod]
    public async Task ShowPalletStock_TheTubeGivesSixColumnsWithTheBatch()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Tube);

        var reply = await sim.RequestAsync(CuttingCommands.ShowPalletStock, "M1");

        Assert.AreEqual(6, reply.Columns);
        Assert.AreEqual("20", reply.RowsOfFields()[0][1]);
    }

    [TestMethod]
    public async Task ShowPalletPosition_RepliesAndThenSendsThePosition()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);
        await sim.ConnectAsync();

        var reply = await sim.RequestAsync(CuttingCommands.ShowPalletPosition, "M1");
        var position = await sim.NotificationAsync(CuttingNotifications.PalletChangerPosition);

        Assert.AreEqual("0", reply.Field(2));
        Assert.AreEqual("4", position.Field(2));
    }

    [TestMethod]
    public async Task Notifications_BeforeTheHostConnects_AreHeldNotWritten()
    {
        await using var sim = await SimulatorHarness.StartAsync(CuttingMachineType.Laser2D);

        await sim.Actions.PlanChangedAsync();
        await sim.ConnectAsync();

        Assert.IsFalse(sim.Received.OfType<CuttingNotification>().Any(n => n.Name == CuttingNotifications.PlanChanged));
        Assert.IsTrue(sim.Log.Entries().Any(e => e.Direction == Machine.TelegramDirection.Held));
    }
}
