// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>Runs a virtual machine in steps of one second and keeps everything it said.</summary>
internal sealed class MachineRun
{
    public static readonly DateTimeOffset Start = new(2026, 11, 17, 6, 0, 0, TimeSpan.Zero);

    private MachineRun(VirtualMachine machine, List<SpecMessage> messages)
    {
        Machine = machine;
        Messages = messages;
    }

    public VirtualMachine Machine { get; }

    /// <summary>Every message in the order it was said, the initial values first.</summary>
    public List<SpecMessage> Messages { get; }

    public IEnumerable<SpecValue> ValuesOf(string path)
    {
        return Messages.OfType<SpecValue>().Where(v => v.Path == path);
    }

    public IEnumerable<SpecEvent> EventsOf(string path)
    {
        return Messages.OfType<SpecEvent>().Where(e => e.Path == path);
    }

    public static MachineRun For(TimeSpan duration, SpecOutputConfig? config = null, Action<VirtualMachine, IReadOnlyList<SpecMessage>>? afterStep = null)
    {
        config ??= Config();
        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
        var machine = new VirtualMachine(identity, config, new MachineCounters(1000, 5000, 100), Start);
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        for (var now = Start + TimeSpan.FromSeconds(1); now <= Start + duration; now += TimeSpan.FromSeconds(1))
        {
            var step = machine.Advance(now);
            messages.AddRange(step);
            afterStep?.Invoke(machine, step);
        }
        return new MachineRun(machine, messages);
    }

    /// <summary>A busy scenario: short jobs and frequent alerts, so that a few hours show every case.</summary>
    public static SpecOutputConfig Config(TimeSpan? retention = null, int seed = 42, double failureRate = 3)
    {
        return new SpecOutputConfig
        {
            Scenario = new ScenarioConfig
            {
                Seed = seed,
                JobOrderRetention = retention ?? TimeSpan.FromHours(24),
                SetupTime = TimeSpan.FromSeconds(60),
                LoadTime = TimeSpan.FromSeconds(10),
                IdleTime = TimeSpan.FromSeconds(30),
                FeedOverrideSteps = [1.0, 0.8, 1.2],
                FeedOverrideChangesPerHour = 10,
                SpindleOverrideSteps = [1.0, 0.9],
                SpindleOverrideChangesPerHour = 10,
                ScrapRate = 0.1,
                AbortOnFailureProbability = 0.4,
                ProgramStopsPerHour = 4,
                ProgramStopDuration = TimeSpan.FromSeconds(20),
                QueueChangesPerHour = 3,
                QueueHoldTime = TimeSpan.FromMinutes(3),
                Jobs =
                [
                    new JobTemplate { JobName = "Shaft", Program = "SHAFT.MPF", Quantity = 5, CycleTime = TimeSpan.FromSeconds(40), ExecutingPower = 12000 },
                    new JobTemplate { JobName = "Flange", Program = "FLANGE.MPF", Quantity = 3, CycleTime = TimeSpan.FromSeconds(70), ExecutingPower = 15000 },
                ],
                Alerts =
                [
                    new AlertTemplate { Code = "20017", Text = "Coolant pressure low", Severity = "OffSpec", SeverityValue = 500, Source = "Coolant", RatePerHour = 4, Duration = TimeSpan.FromSeconds(120), ChangeAfter = TimeSpan.FromSeconds(60), ChangedSeverityValue = 700 },
                    new AlertTemplate { Code = "31002", Text = "Spindle drive fault", Severity = "Failure", SeverityValue = 900, RatePerHour = failureRate, Duration = TimeSpan.FromSeconds(90) },
                    new AlertTemplate { Code = "40110", Text = "Lubrication interval reached", Severity = "MaintenanceRequired", RatePerHour = 2, Duration = TimeSpan.FromSeconds(300) },
                ],
            },
        };
    }

    public static string? Text(JsonNode? node, string property)
    {
        return node?[property]?.GetValue<string>();
    }
}
