using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Simulator.Processing;

namespace Pleiades.Playground.Bend.Simulator.Test;

[TestClass]
public sealed class ProductionPlanTest
{
    private SimulatorHarness _harness = null!;

    [TestInitialize]
    public void Initialize() => _harness = new SimulatorHarness();

    [TestCleanup]
    public void Cleanup() => _harness.Dispose();

    private static CreateProductionPackageRequest Request(string name, int desiredQuantity, params (string OrderNo, string PartNo, int Parts)[] positions) =>
        new(name, desiredQuantity, positions.Select(p => new CreateProductionPackagePositionRequest(p.OrderNo, p.PartNo, p.Parts)).ToArray());

    [TestMethod]
    public void A_package_is_added_with_the_defaults_of_a_position_and_sends_no_telegram()
    {
        var result = _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 2, ("FA-1", "Winkel-1", 4), ("FA-2", "Winkel-2", 6)));

        Assert.IsTrue(result.IsSuccess);
        var package = _harness.Runtime.ProductionPackages.Single();
        Assert.AreEqual(2, package.DesiredQuantity);
        Assert.HasCount(2, package.ManufacturingOrders);
        Assert.IsTrue(package.ManufacturingOrders.All(order => order.Priority == "5" && order.Status == RciOrderStatus.GUELTIG));
        Assert.AreEqual("Winkel-1.jupidu", package.ManufacturingOrders[0].ProgramName);
        Assert.IsFalse(Directory.Exists(_harness.ExchangeDirectory) && _harness.TelegramFilesInOrder().Count > 0,
            "test data stays local");
    }

    [TestMethod]
    public void An_order_number_used_in_another_package_is_refused()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 1, ("FA-1", "Winkel-1", 4)));

        var result = _harness.ProductionPlan.AddProductionPackage(Request("PKG-2", 1, ("FA-1", "Winkel-9", 2)));

        Assert.AreEqual(CommandError.InvalidInput, result.Error);
        Assert.HasCount(1, _harness.Runtime.ProductionPackages);
    }

    [TestMethod]
    [DataRow(0, 1, 1, 1)]
    [DataRow(1, 0, 1, 1)]
    [DataRow(1, 1, 0, 1)]
    [DataRow(1, 1, 5, 4)]
    [DataRow(51, 1, 1, 1)]
    public void A_dataset_outside_the_limits_is_refused(int packages, int positions, int minimumParts, int maximumParts)
    {
        var result = _harness.ProductionPlan.GenerateDataset(new GenerateDatasetRequest(packages, positions, minimumParts, maximumParts, "SIM"));

        Assert.AreEqual(CommandError.InvalidInput, result.Error);
        Assert.IsEmpty(_harness.Runtime.ProductionPackages);
    }

    [TestMethod]
    public void A_dataset_has_the_asked_structure_within_the_part_limits()
    {
        var result = _harness.ProductionPlan.GenerateDataset(new GenerateDatasetRequest(4, 3, 2, 7, "HACK"));

        Assert.IsTrue(result.IsSuccess);
        var packages = _harness.Runtime.ProductionPackages;
        Assert.HasCount(4, packages);
        Assert.IsTrue(packages.All(package => package.ProductionPackageName.StartsWith("HACK-", StringComparison.Ordinal) && package.ManufacturingOrders.Length == 3));
        var orders = packages.SelectMany(package => package.ManufacturingOrders).ToList();
        Assert.IsTrue(orders.All(order => order.DesiredNumberOfParts is >= 2 and <= 7));
        Assert.HasCount(orders.Count, orders.Select(order => order.OrderNo).Distinct());
    }

    [TestMethod]
    public void A_package_is_not_deleted_while_the_machine_is_busy()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 1, ("FA-1", "Winkel-1", 4)));
        _harness.BusyState.TryMarkBusy();

        var result = _harness.ProductionPlan.DeleteProductionPackage("PKG-1");

        Assert.AreEqual(CommandError.MachineBusy, result.Error);
        Assert.HasCount(1, _harness.Runtime.ProductionPackages);
    }

    [TestMethod]
    public async Task A_package_whose_positions_are_all_done_leaves_the_plan()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 1, ("FA-1", "Winkel-1", 2), ("FA-2", "Winkel-2", 1)));

        var result = _harness.Processing.StartPackageProcessing("PKG-1", "Bediener1");
        var status = await _harness.WaitForProcessingEndAsync();

        Assert.IsTrue(result.IsSuccess);
        Assert.AreEqual(AutomaticProcessingState.Completed, status.State);
        Assert.IsEmpty(_harness.ProductionPlan.GetProductionPlan());
        var telegrams = _harness.TelegramsInOrder();
        Assert.HasCount(1, telegrams[^2].ProductionPackageFeedbacks!, "the count-up is sent before the package leaves");
        Assert.AreEqual("0", telegrams[^1].OperatingStateFeedbacks!.Single().OperatingState, "then the machine is idle");
        CollectionAssert.AreEqual(
            new[] { "1", "0", "1", "0" },
            telegrams.Where(t => t.OperatingStateFeedbacks is not null).Select(t => t.OperatingStateFeedbacks!.Single().OperatingState).ToArray(),
            "the machine stands idle between the two positions");
    }

    [TestMethod]
    public async Task A_kit_to_be_made_twice_stays_in_the_plan_until_its_second_run()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 2, ("FA-1", "Winkel-1", 1)));

        _harness.Processing.StartPackageProcessing("PKG-1", "Bediener1");
        await _harness.WaitForProcessingEndAsync();
        var afterFirstRun = _harness.ProductionPlan.GetProductionPlan();
        _harness.Processing.StartPackageProcessing("PKG-1", "Bediener1");
        await _harness.WaitForProcessingEndAsync();

        Assert.HasCount(1, afterFirstRun, "the kit is to be made once more");
        Assert.IsEmpty(_harness.ProductionPlan.GetProductionPlan(), "made as often as desired, it leaves the plan");
    }

    [TestMethod]
    public async Task A_package_with_an_open_position_stays_in_the_plan()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 1, ("FA-1", "Winkel-1", 2), ("FA-2", "Winkel-2", 1)));

        _harness.Processing.StartPositionProcessing("PKG-1", "FA-1", "Bediener1");
        await _harness.WaitForProcessingEndAsync();

        var package = _harness.ProductionPlan.GetProductionPlan().Single();
        Assert.AreEqual(2, package.Positions.Single(position => position.OrderNo == "FA-1").ProcessedParts);
    }

    [TestMethod]
    public async Task The_production_plan_survives_a_restart()
    {
        _harness.ProductionPlan.AddProductionPackage(Request("PKG-1", 1, ("FA-1", "Winkel-1", 2), ("FA-2", "Winkel-2", 1)));
        _harness.Processing.StartPositionProcessing("PKG-1", "FA-1", "Bediener1");
        await _harness.WaitForProcessingEndAsync();

        using (var persistence = _harness.Persistence)
        {
            await persistence.SaveAsync(CancellationToken.None);
        }

        var restarted = _harness.CreateRuntime(_harness.Config);
        using var restartedPersistence = SimulatorHarness.PersistenceFor(restarted, _harness.Config);
        Assert.IsTrue(restartedPersistence.Load());

        var order = restarted.ProductionPackages.Single().ManufacturingOrders.Single(o => o.OrderNo == "FA-1");
        Assert.AreEqual(2, order.ProcessedParts);
        Assert.AreEqual(RciOrderStatus.FERTIG, order.Status);
    }

    [TestMethod]
    public async Task A_new_machine_starts_with_demo_packages()
    {
        using var persistence = _harness.Persistence;

        await persistence.StartAsync(CancellationToken.None);
        await persistence.StopAsync(CancellationToken.None);

        Assert.HasCount(3, _harness.Runtime.ProductionPackages);
        Assert.IsTrue(_harness.Runtime.ProductionPackages.All(package => package.ProductionPackageName.StartsWith("DEMO-", StringComparison.Ordinal)));
        Assert.IsTrue(File.Exists(_harness.Config.StatePath), "the seeded plan is saved when the service stops");
    }
}
