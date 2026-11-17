// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>
/// The scenarios of the simulators of the demo stack, as appsettings.json of the simulator has them: the default
/// one (P-04) and the named ones compose picks with <c>Config__SpecOutput__ScenarioName</c> (P-07, M-02).
/// </summary>
[TestClass]
public sealed class ScenarioTest
{
    /// <summary>Scenario names as compose.yaml sets them; the empty name is the default scenario.</summary>
    public static IEnumerable<object[]> Names => [[""], ["housings"], ["small-parts"]];

    [TestMethod]
    [DynamicData(nameof(Names))]
    public void ScenarioOfTheDemoStack_RunsConsistentlyWithItsOwnJobs(string name)
    {
        var config = Settings(name).Resolve();
        Assert.IsTrue(config.Scenario.Jobs.Count > 0, "a scenario of its own");
        Assert.IsTrue(config.Scenario.Alerts.Any(a => a.Severity == "Failure"));

        var identity = new MachineIdentity(config.Manufacturer, "X-01", "https://example.com/X-01");
        var machine = new VirtualMachine(identity, Seeded(config), new MachineCounters(1, 1, 1), MachineRun.Start);
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        for (var now = MachineRun.Start.AddSeconds(1); now <= MachineRun.Start.AddHours(8); now = now.AddSeconds(1))
        {
            messages.AddRange(machine.Advance(now));
        }

        var workMasters = config.Scenario.Jobs.Select(j => j.WorkMasterId).ToHashSet();
        Assert.IsTrue(workMasters.All(w => w.StartsWith("WM-", StringComparison.Ordinal)), "work masters of their own, not program names");
        Assert.IsTrue(config.Scenario.Software.Count > 0, "software of its own");
        var started = messages.OfType<SpecEvent>().Where(e => e.Path == SpecElements.ProgramExecutionStarted).ToList();
        Assert.IsTrue(started.Count > 10, $"{name}: {started.Count} program executions");
        Assert.IsTrue(started.All(e => workMasters.Contains(e.Value["ActiveWorkMaster"]!.GetValue<string>())), "the work masters of the scenario");
        Assert.IsTrue(messages.OfType<SpecEvent>().Any(e => e.Path == SpecElements.JobOrderEnded));
        foreach (var group in messages.OfType<SpecEvent>().GroupBy(e => SpecElements.EventGroup(e.Path)))
        {
            var seqs = group.Select(e => e.Seq).ToList();
            CollectionAssert.AreEqual(Enumerable.Range(1, seqs.Count).Select(i => (long)i).ToList(), seqs, group.Key);
        }
        Assert.AreEqual(config.Scenario.Model, messages.OfType<SpecValue>().Single(v => v.Path == SpecElements.Model).Value!.GetValue<string>());
        var bearing = SpecElements.ExtensionPath(config.ManufacturerDomain, SpecElements.BearingTemperature);
        Assert.IsTrue(messages.OfType<SpecValue>().Any(v => v.Path == bearing), "its signal of the manufacturer");
    }

    [TestMethod]
    public void Scenarios_OfTheDemoStack_DifferFromEachOther()
    {
        var programs = Names.Select(n => string.Join(',', Settings((string)n[0]).Resolve().Scenario.Jobs.Select(j => j.Program))).ToList();
        Assert.AreEqual(programs.Count, programs.Distinct().Count());
        var firstNumbers = Names.Select(n => Settings((string)n[0]).Resolve().Scenario.FirstJobOrderNumber).ToList();
        Assert.AreEqual(firstNumbers.Count, firstNumbers.Distinct().Count(), "job order ids do not repeat between machines");
    }

    [TestMethod]
    public void Scenarios_OfTheDemoStack_IdentifyDifferentMachines()
    {
        var models = Names.Select(n => Settings((string)n[0]).Resolve().Scenario.Model).ToList();
        Assert.AreEqual(models.Count, models.Distinct().Count());
        Assert.IsTrue(Names.All(n => Settings((string)n[0]).Resolve().Scenario.Unavailable.Count == 0), "every element available by default");
    }

    [TestMethod]
    public void Resolve_WithAnUnknownName_Fails()
    {
        Assert.ThrowsExactly<InvalidOperationException>(() => new SpecOutputConfig { ScenarioName = "lathe" }.Resolve());
    }

    [TestMethod]
    public void Manifest_NamesTheSameProfilesForEverySimulator()
    {
        // Every simulator of the stack is a machine tool with one channel and one spindle, so every one declares
        // the same profiles.
        foreach (var name in Names.Select(n => (string)n[0]))
        {
            var config = Settings(name).Resolve();
            var manifest = SpecManifest.Build(new MachineIdentity(config.Manufacturer, "X-01", "https://example.com/X-01"), config);
            CollectionAssert.AreEqual(SpecElements.Profiles.ToList(),
                manifest["profiles"]!.AsArray().Select(p => p!.GetValue<string>()).ToList(), name);
        }
    }

    private static SpecOutputConfig Seeded(SpecOutputConfig config)
    {
        // The scenarios of the stack run without a seed; the test gives one, so that it runs the same each time.
        var json = new ConfigurationBuilder().AddJsonFile(AppSettings()).Build();
        var settings = json.GetSection("Config:SpecOutput").Get<SpecOutputConfig>()!;
        var scenario = config.Scenario;
        return new SpecOutputConfig
        {
            Enabled = true,
            Manufacturer = settings.Manufacturer,
            ManufacturerDomain = settings.ManufacturerDomain,
            Scenario = new ScenarioConfig
            {
                Seed = 7,
                JobOrderRetention = scenario.JobOrderRetention,
                Model = scenario.Model,
                ProductCode = scenario.ProductCode,
                YearOfConstruction = scenario.YearOfConstruction,
                SoftwareRevision = scenario.SoftwareRevision,
                QueuedJobOrders = scenario.QueuedJobOrders,
                FirstJobOrderNumber = scenario.FirstJobOrderNumber,
                Jobs = scenario.Jobs,
                SetupTime = scenario.SetupTime,
                LoadTime = scenario.LoadTime,
                IdleTime = scenario.IdleTime,
                IdlePower = scenario.IdlePower,
                SetupPower = scenario.SetupPower,
                PowerNoise = scenario.PowerNoise,
                ScrapRate = scenario.ScrapRate,
                AbortOnFailureProbability = scenario.AbortOnFailureProbability,
                ProgramStopsPerHour = scenario.ProgramStopsPerHour,
                ProgramStopDuration = scenario.ProgramStopDuration,
                QueueChangesPerHour = scenario.QueueChangesPerHour,
                QueueHoldTime = scenario.QueueHoldTime,
                FeedOverrideSteps = scenario.FeedOverrideSteps,
                FeedOverrideChangesPerHour = scenario.FeedOverrideChangesPerHour,
                SpindleOverrideSteps = scenario.SpindleOverrideSteps,
                SpindleOverrideChangesPerHour = scenario.SpindleOverrideChangesPerHour,
                Alerts = scenario.Alerts,
                BearingTemperatureIdle = scenario.BearingTemperatureIdle,
                BearingTemperatureRunning = scenario.BearingTemperatureRunning,
                BearingTimeConstant = scenario.BearingTimeConstant,
            },
        };
    }

    private static SpecOutputConfig Settings(string scenarioName)
    {
        var json = new ConfigurationBuilder()
            .AddJsonFile(AppSettings())
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Config:SpecOutput:ScenarioName"] = scenarioName })
            .Build();
        return json.GetSection("Config:SpecOutput").Get<SpecOutputConfig>()!;
    }

    private static string AppSettings()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "Pleiades.Playground.Simulator", "appsettings.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        Assert.Fail("appsettings.json of the simulator not found");
        return string.Empty;
    }
}
