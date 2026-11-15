// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

[TestClass]
public sealed class VirtualMachineTest
{
    private static readonly TimeSpan SixHours = TimeSpan.FromHours(6);
    private static readonly string[] StartedStates = ["Running", "Interrupted", "Ended", "Aborted"];

    [TestMethod]
    public void Advance_EveryStep_StatusChannelSpindleAndExecutionAgree()
    {
        var steps = 0;
        MachineRun.For(SixHours, afterStep: (machine, _) =>
        {
            steps++;
            var values = machine.Values.ToDictionary(v => v.Path);
            var itemState = MachineRun.Text(values[SpecElements.Status].Value, "MachineryItemState");
            var channel = values[SpecElements.ChannelState];
            var rotating = values[SpecElements.SpindleIsRotating].Value!.GetValue<bool>();
            var execution = values[SpecElements.ProgramExecution];
            var executionId = MachineRun.Text(execution.Value, "ExecutionId");
            var channelState = channel.Value!.GetValue<string>();

            Assert.AreEqual(itemState == "Executing", channelState == "Active", $"Status and channel at {machine.Now:O}");
            Assert.AreEqual(channelState == "Active", rotating, $"Channel and spindle at {machine.Now:O}");
            Assert.AreEqual(channelState is "Active" or "Interrupted", executionId is not null, $"Channel and execution at {machine.Now:O}");
            Assert.AreEqual(executionId, channel.CorrelationId, "The channel names the running execution");
            Assert.AreEqual(executionId, execution.CorrelationId, "The execution names itself");
            if (executionId is not null)
            {
                Assert.AreEqual(MachineRun.Text(execution.Value, "ActiveProgram"), values[SpecElements.ActiveProgram].Value!.GetValue<string>());
                Assert.AreEqual(executionId, values[SpecElements.ActiveProgram].CorrelationId);
            }
        });
        Assert.AreEqual((int)SixHours.TotalSeconds, steps);
    }

    [TestMethod]
    public void Advance_JobOrders_CarryTheFieldsTheirStateRequires()
    {
        var run = MachineRun.For(SixHours);
        var entries = run.ValuesOf(SpecElements.JobOrders).SelectMany(v => v.Value!.AsArray().Select(e => e!.AsObject()))
            .Concat(run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.JobOrder", StringComparison.Ordinal)).Select(e => e.Value))
            .ToList();

        Assert.IsTrue(entries.Count > 100);
        foreach (var entry in entries)
        {
            var state = entry["State"]!.GetValue<string>();
            Assert.IsNotNull(entry["JobOrderID"]);
            Assert.IsNotNull(entry["StateSince"]);
            var started = StartedStates.Contains(state);
            Assert.AreEqual(started, entry.ContainsKey("ProducedQuantity"), $"ProducedQuantity in {entry}");
            Assert.AreEqual(started, entry.ContainsKey("StartTime"), $"StartTime in {entry}");
            Assert.AreEqual(state is "Ended" or "Aborted", entry.ContainsKey("EndTime"), $"EndTime in {entry}");
            if (started)
            {
                Assert.IsTrue(entry["GoodQuantity"]!.GetValue<double>() <= entry["ProducedQuantity"]!.GetValue<double>());
            }
        }

        // Every state of a job order occurs, except NotAllowedToStart for a started one.
        var states = entries.Select(e => e["State"]!.GetValue<string>()).ToHashSet();
        CollectionAssert.IsSubsetOf(new[] { "NotAllowedToStart", "AllowedToStart", "Running", "Interrupted", "Ended", "Aborted" }, states.ToList());
    }

    [TestMethod]
    public void Advance_JobOrders_HaveAtMostOneActiveEntry()
    {
        var run = MachineRun.For(SixHours);
        foreach (var list in run.ValuesOf(SpecElements.JobOrders))
        {
            var active = list.Value!.AsArray().Count(e => e!["State"]!.GetValue<string>() is "Running" or "Interrupted");
            Assert.IsTrue(active <= 1, $"Active job orders at {list.Timestamp:O}");
            var ids = list.Value.AsArray().Select(e => e!["JobOrderID"]!.GetValue<string>()).ToList();
            Assert.AreEqual(ids.Count, ids.Distinct().Count(), "JobOrderID is the identity of the list");
        }
    }

    [TestMethod]
    public void ProgramExecutionEnded_Energy_IsTheIntegralOfThePublishedPower()
    {
        var run = MachineRun.For(SixHours);
        var power = run.ValuesOf(SpecElements.ActivePower).Select(v => (v.Timestamp, Watt: v.Value!.GetValue<double>())).ToList();
        var starts = run.EventsOf(SpecElements.ProgramExecutionStarted).ToDictionary(e => e.Value["ExecutionId"]!.GetValue<string>(), e => e.Timestamp);
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).ToList();

        Assert.IsTrue(ended.Count > 50);
        foreach (var end in ended)
        {
            var start = starts[end.Value["ExecutionId"]!.GetValue<string>()];
            var expected = Integral(power, start, end.Timestamp);
            Assert.AreEqual(expected, end.Value["EnergyElectricity"]!.GetValue<double>(), 0.002, $"Energy of {end.Value}");
            Assert.AreEqual((end.Timestamp - start).TotalSeconds, end.Value["Duration"]!.GetValue<double>(), 0.001);
        }
    }

    [TestMethod]
    public void EnergyCounter_GrowsByTheIntegralOfThePublishedPower()
    {
        var run = MachineRun.For(SixHours);
        var power = run.ValuesOf(SpecElements.ActivePower).Select(v => (v.Timestamp, Watt: v.Value!.GetValue<double>())).ToList();
        var energy = run.ValuesOf(SpecElements.ActiveEnergy).ToList();
        var first = energy[0];
        foreach (var value in energy.Skip(1))
        {
            var expected = first.Value!.GetValue<double>() + Integral(power, first.Timestamp, value.Timestamp);
            Assert.AreEqual(expected, value.Value!.GetValue<double>(), 0.002, $"Energy at {value.Timestamp:O}");
        }
        Assert.AreEqual(SpecElements.UnitWattHour, first.Unit);
    }

    [TestMethod]
    public void ProgramExecutionEnded_Parts_AddUpToJobOrdersAndTheLifetimeCounter()
    {
        var run = MachineRun.For(SixHours);
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).ToList();
        var completed = ended.Count(e => e.Value["EndState"]!.GetValue<string>() == "Completed");
        Assert.AreEqual(completed, ended.Sum(e => e.Value["PartsProduced"]!.GetValue<int>()));
        Assert.IsTrue(ended.Any(e => e.Value["EndState"]!.GetValue<string>() == "Aborted"), "A failure aborts some executions");

        var lifetime = run.ValuesOf(SpecElements.PartsProducedInLifetime).Select(v => v.Value!.GetValue<long>()).ToList();
        Assert.AreEqual(completed, lifetime[^1] - lifetime[0]);

        // The last entry of a job order holds the parts of all its executions.
        var lastEntries = run.Messages.OfType<SpecEvent>()
            .Where(e => e.Path is SpecElements.JobOrderChanged or SpecElements.JobOrderRemoved)
            .GroupBy(e => e.Value["JobOrderID"]!.GetValue<string>())
            .ToDictionary(g => g.Key, g => g.Last().Value);
        foreach (var group in ended.GroupBy(e => e.Value["JobOrderID"]!.GetValue<string>()))
        {
            Assert.AreEqual(group.Sum(e => e.Value["PartsProduced"]!.GetValue<int>()), lastEntries[group.Key]["ProducedQuantity"]!.GetValue<double>(), group.Key);
        }
    }

    [TestMethod]
    public void FailureAlert_InterruptsOrAbortsTheRunningExecution()
    {
        var run = MachineRun.For(SixHours);
        var failures = run.EventsOf(SpecElements.AlertRaised).Where(e => e.Value["severity"]!.GetValue<string>() == "Failure").ToList();
        Assert.IsTrue(failures.Count > 3);

        var interrupted = 0;
        var aborted = 0;
        foreach (var failure in failures)
        {
            var executionId = failure.Value["correlationId"]!.GetValue<string>();
            var sameTime = run.Messages.Where(m => m.Timestamp == failure.Timestamp).ToList();
            if (sameTime.OfType<SpecEvent>().Any(e => e.Path == SpecElements.ProgramExecutionEnded
                && e.Value["ExecutionId"]!.GetValue<string>() == executionId && e.Value["EndState"]!.GetValue<string>() == "Aborted"))
            {
                aborted++;
                Assert.IsTrue(sameTime.OfType<SpecEvent>().Any(e => e.Path == SpecElements.JobOrderChanged && e.Value["State"]!.GetValue<string>() == "Aborted"));
            }
            else
            {
                interrupted++;
                var channel = sameTime.OfType<SpecValue>().Last(v => v.Path == SpecElements.ChannelState);
                Assert.AreEqual("Interrupted", channel.Value!.GetValue<string>());
                Assert.AreEqual(executionId, channel.CorrelationId);
                Assert.IsTrue(sameTime.OfType<SpecEvent>().Any(e => e.Path == SpecElements.JobOrderChanged && e.Value["State"]!.GetValue<string>() == "Interrupted"));
            }
        }
        Assert.IsTrue(interrupted > 0 && aborted > 0, $"interrupted {interrupted}, aborted {aborted}");
    }

    [TestMethod]
    public void ActiveAlerts_MatchTheirEvents()
    {
        var run = MachineRun.For(SixHours);
        var active = new Dictionary<string, JsonObject>();
        foreach (var message in run.Messages)
        {
            switch (message)
            {
                case SpecEvent { Path: SpecElements.AlertRaised } raised:
                    active.Add(raised.Value["id"]!.GetValue<string>(), raised.Value);
                    break;
                case SpecEvent { Path: SpecElements.AlertChanged } changed:
                    Assert.IsTrue(active.ContainsKey(changed.Value["id"]!.GetValue<string>()));
                    active[changed.Value["id"]!.GetValue<string>()] = changed.Value;
                    break;
                case SpecEvent { Path: SpecElements.AlertCleared } cleared:
                    Assert.IsTrue(active.Remove(cleared.Value["id"]!.GetValue<string>()));
                    break;
                case SpecValue { Path: SpecElements.ActiveAlerts } list:
                    var entries = list.Value!.AsArray().Select(e => e!.AsObject()).ToList();
                    CollectionAssert.AreEquivalent(active.Keys.ToList(), entries.Select(e => e["id"]!.GetValue<string>()).ToList());
                    foreach (var entry in entries)
                    {
                        Assert.IsTrue(JsonNode.DeepEquals(active[entry["id"]!.GetValue<string>()], entry));
                        Assert.IsNotNull(entry["severity"]);
                        Assert.IsNotNull(entry["since"]);
                    }
                    break;
                default:
                    break;
            }
        }
        Assert.IsTrue(run.EventsOf(SpecElements.AlertChanged).Any());
    }

    [TestMethod]
    public void EndedJobOrders_StayForTheRetention_ThenGo()
    {
        var retention = TimeSpan.FromMinutes(30);
        var run = MachineRun.For(TimeSpan.FromHours(3), MachineRun.Config(retention));
        var removed = run.EventsOf(SpecElements.JobOrderRemoved).ToList();
        Assert.IsTrue(removed.Count > 3);
        foreach (var remove in removed)
        {
            var end = DateTimeOffset.Parse(remove.Value["EndTime"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture);
            Assert.IsTrue(remove.Timestamp >= end + retention && remove.Timestamp < end + retention + TimeSpan.FromSeconds(2));
        }

        var kept = MachineRun.For(TimeSpan.FromHours(3));
        Assert.IsFalse(kept.EventsOf(SpecElements.JobOrderRemoved).Any(), "With 24 hours nothing goes within three hours");
    }

    [TestMethod]
    public void Counters_OnlyGrow()
    {
        var run = MachineRun.For(SixHours);
        foreach (var path in new[] { SpecElements.PowerOnDuration, SpecElements.ActiveEnergy, SpecElements.PartsProducedInLifetime, SpecElements.Heartbeat })
        {
            var values = run.ValuesOf(path).Select(v => Number(v.Value)).ToList();
            Assert.IsTrue(values.Zip(values.Skip(1)).All(p => p.Second >= p.First), path);
        }
        var powerOn = run.ValuesOf(SpecElements.PowerOnDuration).ToList();
        Assert.AreEqual((powerOn[^1].Timestamp - powerOn[0].Timestamp).TotalSeconds,
            powerOn[^1].Value!.GetValue<double>() - powerOn[0].Value!.GetValue<double>(), 1);
    }

    [TestMethod]
    public void Values_CarryTheUnitOfTheirElementAndStayInTheManifest()
    {
        var run = MachineRun.For(TimeSpan.FromHours(1), MachineRun.Config(TimeSpan.FromMinutes(10)));
        var paths = SpecElements.Elements.Select(e => e.Path).ToHashSet();
        foreach (var value in run.Messages.OfType<SpecValue>())
        {
            Assert.IsTrue(paths.Contains(value.Path), value.Path);
            var envelope = SpecWire.Envelope(value);
            var isNumber = value.Value is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.Number;
            Assert.AreEqual(isNumber ? SpecElements.UnitOf(value.Path) : null, (string?)envelope["unit"], value.Path);
        }
        CollectionAssert.IsSubsetOf(SpecElements.Events.ToList(), run.Messages.OfType<SpecEvent>().Select(e => e.Path).Distinct().ToList());
        var published = run.Messages.OfType<SpecValue>().Select(v => v.Path).ToHashSet();
        paths.Remove(SpecElements.ConnectionState); // the output sets it, not the machine
        CollectionAssert.AreEquivalent(paths.ToList(), published.ToList());
    }

    [TestMethod]
    public void SameSeed_GivesTheSameRun()
    {
        var first = MachineRun.For(TimeSpan.FromHours(1));
        var second = MachineRun.For(TimeSpan.FromHours(1));
        Assert.AreEqual(first.Messages.Count, second.Messages.Count);
        Assert.AreEqual(Serialise(first), Serialise(second));
    }

    [TestMethod]
    public void MachineId_JoinsDomainAndSerialNumber()
    {
        Assert.AreEqual("example-com_P-04", SpecWire.MachineId("example.com", "P-04"));
        Assert.AreEqual("umati/example-com_P-04/Channel/1/ChannelState", SpecWire.Topic("example-com_P-04", "Channel.1.ChannelState"));
        Assert.AreEqual("umati/example-com_P-04/Manifest", SpecWire.ManifestTopic("example-com_P-04"));
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.MachineId("example.com", "P/04"));
    }

    [TestMethod]
    public void Manifest_LeavesOutAShorterRetention()
    {
        var identity = new MachineIdentity("Example Machine Tools", "P-04", "https://example.com/P-04");
        Assert.AreEqual(86400.0, SpecManifest.Build(identity, MachineRun.Config())["jobOrderRetention"]!.GetValue<double>());
        Assert.IsFalse(SpecManifest.Build(identity, MachineRun.Config(TimeSpan.FromHours(1))).ContainsKey("jobOrderRetention"));
    }

    private static double Number(JsonNode? node)
    {
        return double.Parse(node!.ToJsonString(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string Serialise(MachineRun run)
    {
        return string.Join('\n', run.Messages.Select(m => m switch
        {
            SpecValue v => SpecWire.Envelope(v).ToJsonString(),
            SpecEvent e => SpecWire.Event(e).ToJsonString(),
            _ => string.Empty,
        }));
    }

    /// <summary>Integral of a step function of power over [from, to], in watt hours.</summary>
    private static double Integral(List<(DateTimeOffset Timestamp, double Watt)> power, DateTimeOffset from, DateTimeOffset to)
    {
        var energy = 0.0;
        for (var i = 0; i < power.Count; i++)
        {
            var start = power[i].Timestamp > from ? power[i].Timestamp : from;
            var end = i + 1 < power.Count && power[i + 1].Timestamp < to ? power[i + 1].Timestamp : to;
            if (end > start)
            {
                energy += power[i].Watt * (end - start).TotalHours;
            }
        }
        return energy;
    }
}
