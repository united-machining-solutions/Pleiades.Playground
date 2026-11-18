using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Simulator.Processing;

namespace Pleiades.Playground.Bend.Simulator.Test;

/// <summary>
/// The telegram sequence of one position:
/// 1. OperatingStateFeedback 1 (running)
/// 2. ProductionPackageFeedback (the processed quantity so far, reported by the operator)
/// 3. ProcessingStarted (status active, type 1)
/// 4. one ManufacturingOrderFeedback per part (processed parts 1..n, status active)
/// 5. ProcessingStopped (status finished; paused when cancelled; type 1)
/// 6. ProductionPackageFeedback (processed quantity + 1, reported by nobody), only once every position is complete
/// 7. OperatingStateFeedback 0 (idle).
/// </summary>
[TestClass]
public sealed class AutomaticPositionProcessorTest
{
    private const string Operator = "Bediener1";

    private SimulatorHarness _harness = null!;

    [TestInitialize]
    public void Initialize() => _harness = new SimulatorHarness();

    [TestCleanup]
    public void Cleanup() => _harness.Dispose();

    [TestMethod]
    public async Task A_single_position_package_sends_the_sequence_of_the_machine()
    {
        var position = Position("FA-1", 3);
        var package = Package("PKG-1", 1, position);

        var outcome = await ProcessAsync(package, position);

        Assert.AreEqual(PositionProcessingOutcome.PackageCompleted, outcome);
        var telegrams = _harness.TelegramsInOrder();
        Assert.HasCount(9, telegrams);
        AssertOperatingState(telegrams[0], RciOperatingState.Running);
        AssertPackageFeedback(telegrams[1], "PKG-1", 1, 0, Operator);
        AssertProcessingStarted(telegrams[2], "PKG-1", "FA-1");
        AssertOrderFeedback(telegrams[3], "PKG-1", "FA-1", 1, Operator);
        AssertOrderFeedback(telegrams[4], "PKG-1", "FA-1", 2, Operator);
        AssertOrderFeedback(telegrams[5], "PKG-1", "FA-1", 3, Operator);
        AssertProcessingStopped(telegrams[6], "PKG-1", "FA-1", 3, RciOrderStatus.FERTIG);
        AssertPackageFeedback(telegrams[7], "PKG-1", 1, 1, string.Empty);
        AssertOperatingState(telegrams[8], RciOperatingState.Idle);
    }

    [TestMethod]
    public async Task The_host_reads_the_end_of_the_processing_as_the_order_stopped()
    {
        var position = Position("FA-1", 1);
        var package = Package("PKG-1", 1, position);

        await ProcessAsync(package, position);

        var parser = new RciTelegramParser(TimeZoneInfo.Utc);
        var orders = _harness.TelegramFilesInOrder()
            .SelectMany(file => parser.Parse(File.ReadAllText(file), DateTime.UtcNow))
            .OfType<OrderObserved>()
            .ToList();
        Assert.AreEqual(OrderEvent.Started, orders[0].Event, "the host reads the start first");
        Assert.AreEqual("Part-FA-1.jupidu", orders[0].ProgramName, "the start names the program");
        var stopped = orders.Single(order => order.Event == OrderEvent.Stopped);
        Assert.AreEqual("FA-1", stopped.OrderNo);
        Assert.AreEqual("PKG-1", stopped.ProductionPackage);
    }

    [TestMethod]
    public async Task A_package_that_reached_its_quantity_keeps_its_position_complete()
    {
        var position = Position("FA-1", 2);
        var package = Package("PKG-1", 1, position);

        await ProcessAsync(package, position);

        Assert.AreEqual(1, package.ProcessedQuantity);
        Assert.AreEqual(2, position.ProcessedParts);
        Assert.AreEqual(RciOrderStatus.FERTIG, position.Status);
        Assert.AreEqual(0, AutomaticPositionProcessor.GetRemainingParts(position));
    }

    [TestMethod]
    public async Task A_kit_to_be_made_again_starts_its_positions_from_zero()
    {
        var position = Position("FA-1", 2);
        var package = Package("PKG-1", 3, position);

        var outcome = await ProcessAsync(package, position);

        Assert.AreEqual(PositionProcessingOutcome.KitCompleted, outcome, "the package is to be made twice more");
        Assert.AreEqual(1, package.ProcessedQuantity);
        Assert.AreEqual(0, position.ProcessedParts);
        Assert.AreEqual(RciOrderStatus.GUELTIG, position.Status);
        Assert.HasCount(1, _harness.TelegramsInOrder()[^2].ProductionPackageFeedbacks!);
    }

    [TestMethod]
    public async Task The_package_counts_on_from_run_to_run_until_it_is_made_as_often_as_desired()
    {
        var position = Position("FA-1", 1);
        var package = Package("PKG-1", 2, position);

        var first = await ProcessAsync(package, position);
        var second = await ProcessAsync(package, position);

        Assert.AreEqual(PositionProcessingOutcome.KitCompleted, first);
        Assert.AreEqual(PositionProcessingOutcome.PackageCompleted, second);
        Assert.AreEqual(2, package.ProcessedQuantity);
        var packageFeedbacks = _harness.TelegramsInOrder()
            .Where(t => t.ProductionPackageFeedbacks is not null)
            .Select(t => t.ProductionPackageFeedbacks!.Single().ProductionPackages!.Single().ProcessedQuantity)
            .ToArray();
        CollectionAssert.AreEqual(new[] { 0, 1, 1, 2 }, packageFeedbacks, "the start of a run reports the quantity so far");
    }

    [TestMethod]
    public async Task A_cancelled_position_goes_on_from_its_parts()
    {
        var position = Position("FA-1", 4);
        position.ProcessedParts = 2;
        var package = Package("PKG-1", 1, position);

        await ProcessAsync(package, position);

        var parts = _harness.TelegramsInOrder()
            .Where(t => t.ManufacturingOrderFeedbacks is not null)
            .Select(t => t.ManufacturingOrderFeedbacks!.Single().ManufacturingOrders!.Single().ProcessedParts)
            .ToArray();
        CollectionAssert.AreEqual(new[] { 3, 4 }, parts);
    }

    [TestMethod]
    public async Task An_open_other_position_keeps_the_package_from_counting_up()
    {
        var first = Position("FA-1", 2);
        var second = Position("FA-2", 4);
        var package = Package("PKG-1", 1, first, second);

        var outcome = await ProcessAsync(package, first);

        Assert.AreEqual(PositionProcessingOutcome.Processed, outcome);
        Assert.HasCount(7, _harness.TelegramsInOrder(), "running, 1 package feedback, started, 2 part feedbacks, stopped, idle; no count-up");
        Assert.AreEqual(0, package.ProcessedQuantity);
    }

    [TestMethod]
    public async Task Positions_one_after_another_count_the_package_up_after_the_last()
    {
        var first = Position("FA-1", 1);
        var second = Position("FA-2", 2);
        var package = Package("PKG-1", 1, first, second);

        var firstOutcome = await ProcessAsync(package, first);
        var secondOutcome = await ProcessAsync(package, second);

        Assert.AreEqual(PositionProcessingOutcome.Processed, firstOutcome);
        Assert.AreEqual(PositionProcessingOutcome.PackageCompleted, secondOutcome);
        var telegrams = _harness.TelegramsInOrder();
        Assert.HasCount(14, telegrams);
        AssertOperatingState(telegrams[0], RciOperatingState.Running);
        AssertPackageFeedback(telegrams[1], "PKG-1", 1, 0, Operator);
        AssertProcessingStarted(telegrams[2], "PKG-1", "FA-1");
        AssertOrderFeedback(telegrams[3], "PKG-1", "FA-1", 1, Operator);
        AssertProcessingStopped(telegrams[4], "PKG-1", "FA-1", 1, RciOrderStatus.FERTIG);
        AssertOperatingState(telegrams[5], RciOperatingState.Idle);
        AssertOperatingState(telegrams[6], RciOperatingState.Running);
        AssertPackageFeedback(telegrams[7], "PKG-1", 1, 0, Operator);
        AssertProcessingStarted(telegrams[8], "PKG-1", "FA-2");
        AssertOrderFeedback(telegrams[9], "PKG-1", "FA-2", 1, Operator);
        AssertOrderFeedback(telegrams[10], "PKG-1", "FA-2", 2, Operator);
        AssertProcessingStopped(telegrams[11], "PKG-1", "FA-2", 2, RciOrderStatus.FERTIG);
        AssertPackageFeedback(telegrams[12], "PKG-1", 1, 1, string.Empty);
        AssertOperatingState(telegrams[13], RciOperatingState.Idle);
    }

    [TestMethod]
    public async Task A_complete_position_sends_nothing()
    {
        var position = Position("FA-1", 2);
        position.ProcessedParts = 2;
        var package = Package("PKG-1", 1, position);

        var outcome = await ProcessAsync(package, position);

        Assert.AreEqual(PositionProcessingOutcome.AlreadyCompleted, outcome);
        Assert.IsEmpty(_harness.TelegramFilesInOrder());
    }

    [TestMethod]
    public async Task A_cancelled_position_stops_without_counting_up()
    {
        var position = Position("FA-1", 5);
        var package = Package("PKG-1", 1, position);
        _harness.Runtime.ProductionPackages.Add(package);
        using var cancellation = new CancellationTokenSource();
        var context = Context(package, position) with
        {
            ReportPartProgress = (processed, _) =>
            {
                if (processed == 2)
                {
                    cancellation.Cancel();
                }
            },
        };

        var outcome = await AutomaticPositionProcessor.ProcessPositionAsync(context, cancellation.Token);

        Assert.AreEqual(PositionProcessingOutcome.Cancelled, outcome);
        var telegrams = _harness.TelegramsInOrder();
        Assert.HasCount(7, telegrams, "running, 1 package feedback, started, 2 part feedbacks, stopped, idle");
        AssertProcessingStopped(telegrams[5], "PKG-1", "FA-1", 2, RciOrderStatus.PAUSIERT);
        AssertOperatingState(telegrams[6], RciOperatingState.Idle);
        Assert.AreEqual(0, package.ProcessedQuantity);
    }

    private static ManufacturingOrder Position(string orderNo, int desiredParts) =>
        new() { OrderNo = orderNo, PartNo = $"Part-{orderNo}", DesiredNumberOfParts = desiredParts, Status = RciOrderStatus.GUELTIG };

    private static ProductionPackage Package(string name, int desiredQuantity, params ManufacturingOrder[] positions) =>
        new() { ProductionPackageName = name, DesiredQuantity = desiredQuantity, ManufacturingOrders = positions };

    private AutomaticPositionProcessingContext Context(ProductionPackage package, ManufacturingOrder position) =>
        new(_harness.Runtime.Telegrams, _harness.Runtime.GetProductionPackagesSnapshot(), package, position, Operator, TimeSpan.Zero, null);

    private Task<PositionProcessingOutcome> ProcessAsync(ProductionPackage package, ManufacturingOrder position)
    {
        if (!_harness.Runtime.ProductionPackages.Contains(package))
        {
            _harness.Runtime.ProductionPackages.Add(package);
        }

        return AutomaticPositionProcessor.ProcessPositionAsync(Context(package, position), CancellationToken.None);
    }

    private static void AssertOperatingState(RciTelegram telegram, RciOperatingState state)
    {
        var feedback = telegram.OperatingStateFeedbacks!.Single();
        Assert.AreEqual(((int)state).ToString(System.Globalization.CultureInfo.InvariantCulture), feedback.OperatingState);
    }

    private static void AssertProcessingStarted(RciTelegram telegram, string package, string orderNo)
    {
        var started = telegram.ProcessingsStarted!.Single();
        Assert.AreEqual("1", started.Type, "the gross run time of the program");
        Assert.AreEqual(Operator, started.ReportedBy);
        var order = started.ManufacturingOrders!.Single();
        Assert.AreEqual(package, order.ProductionPackageName);
        Assert.AreEqual(orderNo, order.OrderNo);
        Assert.AreEqual($"Part-{orderNo}.jupidu", order.ProgramName);
        Assert.IsLessThan(1, order.ProcessedParts, "no part yet");
        Assert.AreEqual(RciOrderStatus.AKTIV, order.Status);
    }

    private static void AssertProcessingStopped(RciTelegram telegram, string package, string orderNo, int processedParts, RciOrderStatus status)
    {
        var stopped = telegram.ProcessingsStopped!.Single();
        Assert.AreEqual("1", stopped.Type, "the gross run time of the program");
        Assert.AreEqual(Operator, stopped.ReportedBy);
        var order = stopped.ManufacturingOrders!.Single();
        Assert.AreEqual(package, order.ProductionPackageName);
        Assert.AreEqual(orderNo, order.OrderNo);
        Assert.AreEqual(processedParts, order.ProcessedParts);
        Assert.AreEqual(status, order.Status);
    }

    private static void AssertPackageFeedback(RciTelegram telegram, string package, int desired, int processed, string reportedBy)
    {
        Assert.IsNull(telegram.ManufacturingOrderFeedbacks);
        var feedback = telegram.ProductionPackageFeedbacks!.Single();
        Assert.AreEqual(reportedBy, feedback.ReportedBy);
        var state = feedback.ProductionPackages!.Single();
        Assert.AreEqual(package, state.ProductionPackageName);
        Assert.AreEqual(desired, state.DesiredQuantity);
        Assert.AreEqual(processed, state.ProcessedQuantity);
        Assert.AreEqual("7", state.StatusText);
    }

    private static void AssertOrderFeedback(RciTelegram telegram, string package, string orderNo, int processedParts, string reportedBy)
    {
        Assert.IsNull(telegram.ProductionPackageFeedbacks);
        var feedback = telegram.ManufacturingOrderFeedbacks!.Single();
        Assert.AreEqual(reportedBy, feedback.ReportedBy);
        var order = feedback.ManufacturingOrders!.Single();
        Assert.AreEqual(package, order.ProductionPackageName);
        Assert.AreEqual(orderNo, order.OrderNo);
        Assert.AreEqual($"Part-{orderNo}.jupidu", order.ProgramName, "the bending program is the part number with .jupidu");
        Assert.AreEqual(processedParts, order.ProcessedParts);
        Assert.AreEqual(RciOrderStatus.AKTIV, order.Status);
    }
}
