// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>
/// What a virtual machine keeps across a restart of the simulator: a new run goes on with the job order numbers and
/// gives no id of the run before it again.
/// </summary>
[TestClass]
public sealed class RestartTest
{
    private static readonly MachineIdentity Identity = new("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public void ARestart_GoesOnWithTheJobOrderNumbers_ThroughTheCounterFile()
    {
        var path = Path.Combine(Path.GetTempPath(), $"counters-{Guid.NewGuid():N}.json");
        try
        {
            var first = new VirtualMachine(Identity, MachineRun.Config(), new MachineCounters(1, 1, 1), MachineRun.Start);
            var firstIds = JobOrderIds(first, MachineRun.Start, TimeSpan.FromHours(2));
            SpecCounterStore.Save(path, first.Counters);

            var restart = MachineRun.Start.AddHours(2).AddMinutes(1);
            var second = new VirtualMachine(Identity, MachineRun.Config(), SpecCounterStore.Load(path, MachineRun.Config().Scenario, TimeSpan.FromSeconds(1)), restart);
            var secondIds = JobOrderIds(second, restart, TimeSpan.FromMinutes(10));

            Assert.IsNotEmpty(secondIds);
            Assert.IsEmpty(firstIds.Intersect(secondIds).ToList(), "no job order id of the first run comes again");
        }
        finally
        {
            File.Delete(path);
        }
    }

    [TestMethod]
    public void ACounterFileWithoutTheNextNumber_GivesNoJobOrderIdOfTheRunBefore()
    {
        var path = Path.Combine(Path.GetTempPath(), $"counters-{Guid.NewGuid():N}.json");
        try
        {
            // A run as before the number was kept: it begins at the first number, and its file does not name the next.
            var config = MachineRun.Config();
            var before = new VirtualMachine(Identity, config, new MachineCounters(config.Scenario.InitialPowerOnDuration, 1, 1), MachineRun.Start);
            var beforeIds = JobOrderIds(before, MachineRun.Start, TimeSpan.FromHours(2));
            Assert.Contains($"{config.Scenario.FirstJobOrderNumber}/01", beforeIds);
            var counters = before.Counters;
            File.WriteAllText(path, JsonSerializer.Serialize(new { counters.PowerOnDuration, counters.Energy, counters.PartsProduced, counters.OperationDuration }));

            var restart = MachineRun.Start.AddHours(2).AddMinutes(1);
            var loaded = SpecCounterStore.Load(path, config.Scenario, TimeSpan.FromSeconds(1));
            var after = new VirtualMachine(Identity, config, loaded, restart);
            var afterIds = JobOrderIds(after, restart, TimeSpan.FromMinutes(10));

            Assert.IsNotNull(loaded.NextJobOrderNumber);
            Assert.IsNotEmpty(afterIds);
            Assert.IsEmpty(beforeIds.Intersect(afterIds).ToList(), "no job order id of the run before comes again");
        }
        finally
        {
            File.Delete(path);
        }
    }

    [TestMethod]
    public void TheNumberAfterEarlierRuns_LeavesRoomForTwoJobOrdersAStep()
    {
        var scenario = MachineRun.Config().Scenario;
        var counters = new MachineCounters(scenario.InitialPowerOnDuration + 3600, 1, 1);

        var next = SpecCounterStore.NextJobOrderNumberAfterEarlierRuns(counters, scenario, TimeSpan.FromSeconds(1));

        // An hour and the save interval in steps of a second, two job orders a step, and the queue of the start.
        Assert.AreEqual(scenario.FirstJobOrderNumber + scenario.QueuedJobOrders + (2 * (3600 + 30)), next);
    }

    [TestMethod]
    public void AFirstRun_BeginsWithTheFirstNumberOfTheScenario()
    {
        var config = MachineRun.Config();
        var machine = new VirtualMachine(Identity, config, new MachineCounters(1, 1, 1), MachineRun.Start);

        var ids = JobOrderIds(machine, MachineRun.Start, TimeSpan.Zero);

        Assert.AreEqual($"{config.Scenario.FirstJobOrderNumber}/01", ids.Order(StringComparer.Ordinal).First());
    }

    [TestMethod]
    public void ARestartWithASeed_GivesNewIds()
    {
        var first = new VirtualMachine(Identity, MachineRun.Config(), new MachineCounters(1, 1, 1), MachineRun.Start);
        var second = new VirtualMachine(Identity, MachineRun.Config(), new MachineCounters(1, 1, 1), MachineRun.Start.AddHours(1));

        var firstIds = ExecutionAndAlertIds(first, MachineRun.Start);
        var secondIds = ExecutionAndAlertIds(second, MachineRun.Start.AddHours(1));

        Assert.IsNotEmpty(firstIds);
        Assert.IsEmpty(firstIds.Intersect(secondIds).ToList(), "the same seed, another run: other execution and alert ids");
    }

    private static HashSet<string> JobOrderIds(VirtualMachine machine, DateTimeOffset start, TimeSpan duration)
    {
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        for (var now = start.AddSeconds(1); now <= start + duration; now = now.AddSeconds(1))
        {
            messages.AddRange(machine.Advance(now));
        }
        return [.. messages.OfType<SpecEvent>()
            .Where(e => e.Value["JobOrderID"] is not null)
            .Select(e => e.Value["JobOrderID"]!.GetValue<string>())];
    }

    private static HashSet<string> ExecutionAndAlertIds(VirtualMachine machine, DateTimeOffset start)
    {
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        for (var now = start.AddSeconds(1); now <= start.AddHours(1); now = now.AddSeconds(1))
        {
            messages.AddRange(machine.Advance(now));
        }
        return [.. messages.OfType<SpecEvent>()
            .SelectMany(e => new[] { e.Value["ExecutionId"], e.Path.StartsWith("Notification.Alert", StringComparison.Ordinal) ? e.Value["Id"] : null })
            .Where(id => id is not null)
            .Select(id => id!.GetValue<string>())];
    }
}
