using Pleiades.Playground.Cutting.Protocol.Model;

namespace Pleiades.Playground.Cutting.Protocol.Test;

[TestClass]
public sealed class CuttingSupportTest
{
    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D, CuttingCommands.ShowPalletPosition, true)]
    [DataRow(CuttingMachineType.Laser2D, CuttingCommands.LocationAvailable, false)]
    [DataRow(CuttingMachineType.Tube, CuttingCommands.ShowPalletStock, true)]
    [DataRow(CuttingMachineType.Tube, CuttingCommands.InsertOrder, false)]
    [DataRow(CuttingMachineType.Punch, CuttingCommands.LocationAvailable, true)]
    [DataRow(CuttingMachineType.Punch, CuttingCommands.SheetLoadAcknowledge, true)]
    [DataRow(CuttingMachineType.Punch, CuttingCommands.ShowPalletStock, false)]
    [DataRow(CuttingMachineType.Punch, "UNKNOWN", false)]
    public void Supports_FollowsTheTablesOfTheSpecification(CuttingMachineType type, string command, bool expected)
    {
        Assert.AreEqual(expected, CuttingSupport.Supports(type, command));
    }

    [TestMethod]
    public void Notifications_OnlyTheTubeSendsTheAllocation()
    {
        var tube = CuttingSupport.Notifications(CuttingMachineType.Tube).Select(d => d.Name).ToList();
        var punch = CuttingSupport.Notifications(CuttingMachineType.Punch).Select(d => d.Name).ToList();

        CollectionAssert.Contains(tube, CuttingNotifications.StartAllocation);
        CollectionAssert.DoesNotContain(punch, CuttingNotifications.StartAllocation);
        CollectionAssert.Contains(punch, CuttingNotifications.PartUnloadFinished);
    }

    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D, 8)]
    [DataRow(CuttingMachineType.Punch, 8)]
    [DataRow(CuttingMachineType.Tube, 10)]
    public void FieldsFor_StartNcp_EndsWithTheLastFieldTheTypeSends(CuttingMachineType type, int count)
    {
        var definition = CuttingNotifications.Find(CuttingNotifications.StartNcp)!;

        Assert.HasCount(count, definition.FieldsFor(type));
    }

    [TestMethod]
    [DataRow(CuttingMachineType.Laser2D, 0)]
    [DataRow(CuttingMachineType.Punch, 1)]
    [DataRow(CuttingMachineType.Laser3D, 2)]
    [DataRow(CuttingMachineType.Tube, 3)]
    public void MachineInfoCode_CountsAsTheReplyToMachinfo(CuttingMachineType type, int code)
    {
        Assert.AreEqual(code, type.MachineInfoCode());
    }
}
