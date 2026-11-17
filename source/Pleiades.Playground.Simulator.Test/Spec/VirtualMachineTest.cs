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
            var executionState = MachineRun.Text(execution.Value, "State");
            var channelState = channel.Value!.GetValue<string>();
            var expectedChannel = executionState switch
            {
                "Running" => "Active",
                "Interrupted" => "Interrupted",
                _ => "Reset",
            };

            Assert.AreEqual(itemState == "Executing", channelState == "Active", $"Status and channel at {machine.Now:O}");
            Assert.AreEqual(channelState == "Active", rotating, $"Channel and spindle at {machine.Now:O}");
            Assert.AreEqual(expectedChannel, channelState, $"Channel and execution at {machine.Now:O}");
            Assert.AreEqual(channelState == "Reset" ? null : executionId, channel.CorrelationId, "The channel names the running execution");
            Assert.AreEqual(executionId, execution.CorrelationId, "The execution names itself");
            if (executionState is "Running" or "Interrupted")
            {
                Assert.AreEqual(MachineRun.Text(execution.Value, "ActiveWorkMaster"), values[SpecElements.ActiveWorkMaster].Value!.GetValue<string>());
                Assert.AreEqual(executionId, values[SpecElements.ActiveWorkMaster].CorrelationId);
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
            // A cancelled job order is aborted without having run: it has no start and no quantity.
            var started = StartedStates.Contains(state) && !(state == "Aborted" && !entry.ContainsKey("StartTime"));
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
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).Concat(run.EventsOf(SpecElements.ProgramExecutionAborted)).ToList();

        Assert.IsTrue(ended.Count > 50);
        foreach (var end in ended)
        {
            var start = starts[end.Value["ExecutionId"]!.GetValue<string>()];
            Assert.AreEqual(SpecWire.Timestamp(start), end.Value["StartTime"]!.GetValue<string>());
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
        var aborted = run.EventsOf(SpecElements.ProgramExecutionAborted).ToList();
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).Concat(aborted).ToList();
        var completed = run.EventsOf(SpecElements.ProgramExecutionEnded).Count();
        Assert.AreEqual(completed, ended.Sum(e => e.Value["PartsProduced"]!.GetValue<int>()));
        Assert.IsTrue(aborted.Count > 0, "A failure aborts some executions");
        Assert.IsTrue(aborted.All(e => e.Value["PartsProduced"]!.GetValue<int>() == 0));

        var lifetime = run.ValuesOf(SpecElements.PartsProducedInLifetime).Select(v => v.Value!.GetValue<long>()).ToList();
        Assert.AreEqual(completed, lifetime[^1] - lifetime[0]);

        // The last entry of a job order holds the parts of all its executions.
        var lastEntries = run.Messages.OfType<SpecEvent>()
            .Where(e => e.Path.StartsWith("Production.JobOrder", StringComparison.Ordinal))
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
        var failures = run.EventsOf(SpecElements.AlertRaised).Where(e => e.Value["Severity"]!.GetValue<string>() == "Failure").ToList();
        Assert.IsTrue(failures.Count > 3);

        var interrupted = 0;
        var aborted = 0;
        foreach (var failure in failures)
        {
            var executionId = failure.Value["correlationId"]!.GetValue<string>();
            var sameTime = run.Messages.Where(m => m.Timestamp == failure.Timestamp).ToList();
            var events = sameTime.OfType<SpecEvent>().ToList();
            if (events.Any(e => e.Path == SpecElements.ProgramExecutionAborted && e.Value["ExecutionId"]!.GetValue<string>() == executionId))
            {
                aborted++;
                Assert.IsTrue(events.Any(e => e.Path == SpecElements.JobOrderAborted && e.Value.ContainsKey("StartTime")));
            }
            else
            {
                interrupted++;
                var channel = sameTime.OfType<SpecValue>().Last(v => v.Path == SpecElements.ChannelState);
                Assert.AreEqual("Interrupted", channel.Value!.GetValue<string>());
                Assert.AreEqual(executionId, channel.CorrelationId);
                Assert.IsTrue(events.Any(e => e.Path == SpecElements.ProgramExecutionInterrupted && e.Value["ExecutionId"]!.GetValue<string>() == executionId));
                Assert.IsTrue(events.Any(e => e.Path == SpecElements.JobOrderInterrupted));
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
                    active.Add(raised.Value["Id"]!.GetValue<string>(), raised.Value);
                    break;
                case SpecEvent { Path: SpecElements.AlertChanged } changed:
                    Assert.IsTrue(active.ContainsKey(changed.Value["Id"]!.GetValue<string>()));
                    active[changed.Value["Id"]!.GetValue<string>()] = changed.Value;
                    break;
                case SpecEvent { Path: SpecElements.AlertCleared } cleared:
                    Assert.IsTrue(active.Remove(cleared.Value["Id"]!.GetValue<string>()));
                    break;
                case SpecValue { Path: SpecElements.ActiveAlerts } list:
                    var entries = list.Value!.AsArray().Select(e => e!.AsObject()).ToList();
                    CollectionAssert.AreEquivalent(active.Keys.ToList(), entries.Select(e => e["Id"]!.GetValue<string>()).ToList());
                    foreach (var entry in entries)
                    {
                        Assert.IsTrue(JsonNode.DeepEquals(active[entry["Id"]!.GetValue<string>()], entry));
                        Assert.IsNotNull(entry["Severity"]);
                        Assert.IsNotNull(entry["Time"]);
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
        var removed = run.EventsOf(SpecElements.JobOrderRemoved).Where(e => e.Value.ContainsKey("EndTime")).ToList();
        Assert.IsTrue(removed.Count > 3);
        foreach (var remove in removed)
        {
            var end = DateTimeOffset.Parse(remove.Value["EndTime"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture);
            Assert.IsTrue(remove.Timestamp >= end + retention && remove.Timestamp < end + retention + TimeSpan.FromSeconds(2));
        }

        var kept = MachineRun.For(TimeSpan.FromHours(3));
        Assert.IsFalse(kept.EventsOf(SpecElements.JobOrderRemoved).Any(e => e.Value.ContainsKey("EndTime")),
            "With 24 hours nothing that ended goes within three hours");
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
        var run = MachineRun.For(SixHours, MachineRun.Config(TimeSpan.FromMinutes(10)));
        var paths = SpecElements.ElementsFor("example.com").Select(e => e.Path).ToHashSet();
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
    public void Events_AreNumberedWithoutAGapFromOne()
    {
        var run = MachineRun.For(SixHours);
        // seq counts within each group of events, Production and Notification apart.
        foreach (var group in run.Messages.OfType<SpecEvent>().GroupBy(e => SpecElements.EventGroup(e.Path)))
        {
            var seqs = group.Select(e => e.Seq).ToList();
            Assert.IsTrue(seqs.Count > 20, group.Key);
            CollectionAssert.AreEqual(Enumerable.Range(1, seqs.Count).Select(i => (long)i).ToList(), seqs, group.Key);
        }
        CollectionAssert.AreEquivalent(new[] { "Production", "Notification" },
            run.Messages.OfType<SpecEvent>().Select(e => SpecElements.EventGroup(e.Path)).Distinct().ToList());
        Assert.AreEqual(SpecWire.Timestamp(MachineRun.Start), run.Machine.SeqEpoch);
    }

    [TestMethod]
    public void JobOrderChanged_NeverComesForARunningTimeAlone()
    {
        var run = MachineRun.For(SixHours);
        var last = new Dictionary<string, JsonObject>();
        var changed = 0;
        foreach (var specEvent in run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.JobOrder", StringComparison.Ordinal)))
        {
            var id = specEvent.Value["JobOrderID"]!.GetValue<string>();
            var discrete = (JsonObject)specEvent.Value.DeepClone();
            discrete.Remove("ActualProductionTime");
            if (specEvent.Path == SpecElements.JobOrderChanged)
            {
                changed++;
                Assert.IsFalse(JsonNode.DeepEquals(last[id], discrete), $"JobOrderChanged without a discrete change: {specEvent.Value}");
                Assert.AreEqual(last[id]["State"]!.GetValue<string>(), discrete["State"]!.GetValue<string>(), "JobOrderChanged never changes the state");
            }
            last[id] = discrete;
        }
        Assert.IsTrue(changed > 50);
    }

    [TestMethod]
    public void JobOrderEvents_Alone_GiveTheSameListAsTheValue()
    {
        var run = MachineRun.For(SixHours, MachineRun.Config(TimeSpan.FromMinutes(20)));
        var replayed = new Dictionary<string, JsonObject>();
        foreach (var message in run.Messages)
        {
            switch (message)
            {
                case SpecEvent { Path: SpecElements.JobOrderAdded } added:
                    replayed.Add(added.Value["JobOrderID"]!.GetValue<string>(), added.Value);
                    break;
                case SpecEvent { Path: SpecElements.JobOrderRemoved } removed:
                    Assert.IsTrue(replayed.Remove(removed.Value["JobOrderID"]!.GetValue<string>()));
                    break;
                case SpecEvent other when other.Path.StartsWith("Production.JobOrder", StringComparison.Ordinal):
                    replayed[other.Value["JobOrderID"]!.GetValue<string>()] = other.Value;
                    break;
                case SpecValue { Path: SpecElements.JobOrders } list:
                    var entries = list.Value!.AsArray().Select(e => e!.AsObject()).ToList();
                    Assert.HasCount(entries.Count, replayed);
                    foreach (var entry in entries)
                    {
                        var id = entry["JobOrderID"]!.GetValue<string>();
                        var expected = (JsonObject)entry.DeepClone();
                        var actual = (JsonObject)replayed[id].DeepClone();
                        expected.Remove("ActualProductionTime");
                        actual.Remove("ActualProductionTime");
                        Assert.IsTrue(JsonNode.DeepEquals(expected, actual), $"{id} at {list.Timestamp:O}");
                    }
                    break;
                default:
                    break;
            }
        }
    }

    [TestMethod]
    public void JobOrderEvents_FollowTheTransitionsOfTheirState()
    {
        var run = MachineRun.For(SixHours, MachineRun.Config(TimeSpan.FromMinutes(20)));
        var states = new Dictionary<string, string>();
        var seen = new HashSet<string>();
        foreach (var specEvent in run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.JobOrder", StringComparison.Ordinal)))
        {
            var id = specEvent.Value["JobOrderID"]!.GetValue<string>();
            var state = specEvent.Value["State"]!.GetValue<string>();
            states.TryGetValue(id, out var before);
            var expected = specEvent.Path == SpecElements.JobOrderRemoved
                ? SpecElements.JobOrderRemoved
                : (before, state) switch
                {
                    (null, "NotAllowedToStart" or "AllowedToStart") => SpecElements.JobOrderAdded,
                    ("NotAllowedToStart", "AllowedToStart") => SpecElements.JobOrderReleased,
                    ("AllowedToStart", "NotAllowedToStart") => SpecElements.JobOrderRevoked,
                    ("AllowedToStart", "Running") => SpecElements.JobOrderStarted,
                    ("Running", "Interrupted") => SpecElements.JobOrderInterrupted,
                    ("Interrupted", "Running") => SpecElements.JobOrderResumed,
                    ("Running" or "Interrupted", "Ended") => SpecElements.JobOrderEnded,
                    ("Running" or "Interrupted", "Aborted") => SpecElements.JobOrderAborted,
                    ("NotAllowedToStart" or "AllowedToStart", "Aborted") => SpecElements.JobOrderCancelled,
                    var (b, s) when b == s => SpecElements.JobOrderChanged,
                    _ => "no transition",
                };
            Assert.AreEqual(expected, specEvent.Path, $"{id}: {before} -> {state}");
            if (specEvent.Path == SpecElements.JobOrderRemoved)
            {
                Assert.AreEqual(before, state, "Removed changes no state");
                Assert.IsTrue(state is "NotAllowedToStart" or "AllowedToStart" or "Ended" or "Aborted", $"{id} removed while {state}");
                states.Remove(id);
            }
            else
            {
                states[id] = state;
            }
            if (specEvent.Path == SpecElements.JobOrderCancelled)
            {
                Assert.IsFalse(specEvent.Value.ContainsKey("StartTime"), "A cancelled job order never ran");
            }
            seen.Add(specEvent.Path);
        }
        CollectionAssert.IsSubsetOf(
            new[]
            {
                SpecElements.JobOrderAdded, SpecElements.JobOrderReleased, SpecElements.JobOrderRevoked, SpecElements.JobOrderStarted,
                SpecElements.JobOrderInterrupted, SpecElements.JobOrderResumed, SpecElements.JobOrderEnded, SpecElements.JobOrderAborted,
                SpecElements.JobOrderCancelled, SpecElements.JobOrderChanged, SpecElements.JobOrderRemoved,
            },
            seen.ToList(),
            "every transition occurs");

        // A job order taken back before it started leaves the list without a change of state.
        Assert.IsTrue(run.EventsOf(SpecElements.JobOrderRemoved).Any(e => e.Value["State"]!.GetValue<string>() is "NotAllowedToStart" or "AllowedToStart"));
    }

    [TestMethod]
    public void ProgramExecutionEvents_FollowTheTransitionsOfTheirState()
    {
        var run = MachineRun.For(SixHours);
        var states = new Dictionary<string, string>();
        var seen = new HashSet<string>();
        foreach (var specEvent in run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.ProgramExecution", StringComparison.Ordinal)))
        {
            var id = specEvent.Value["ExecutionId"]!.GetValue<string>();
            var state = specEvent.Value["State"]!.GetValue<string>();
            states.TryGetValue(id, out var before);
            var expected = (before, state) switch
            {
                (null, "Running") => SpecElements.ProgramExecutionStarted,
                ("Running", "Interrupted") => SpecElements.ProgramExecutionInterrupted,
                ("Interrupted", "Running") => SpecElements.ProgramExecutionResumed,
                ("Running" or "Interrupted", "Ended") => SpecElements.ProgramExecutionEnded,
                ("Running" or "Interrupted", "Aborted") => SpecElements.ProgramExecutionAborted,
                _ => "no transition",
            };
            Assert.AreEqual(expected, specEvent.Path, $"{id}: {before} -> {state}");
            Assert.IsNotNull(specEvent.Value["StartTime"]);
            var hasSums = specEvent.Value.ContainsKey("Duration");
            Assert.AreEqual(state is "Ended" or "Aborted", hasSums, $"sums only at the end: {specEvent.Value}");
            Assert.IsFalse(specEvent.Value.ContainsKey("EndState"));
            states[id] = state;
            seen.Add(specEvent.Path);
        }
        CollectionAssert.AreEquivalent(
            new[]
            {
                SpecElements.ProgramExecutionStarted, SpecElements.ProgramExecutionInterrupted, SpecElements.ProgramExecutionResumed,
                SpecElements.ProgramExecutionEnded, SpecElements.ProgramExecutionAborted,
            },
            seen.ToList());
        Assert.IsTrue(states.Values.All(s => s is "Ended" or "Aborted" or "Running" or "Interrupted"));
    }

    [TestMethod]
    public void ProgramStop_InterruptsTheExecutionButNotTheJobOrder()
    {
        var run = MachineRun.For(SixHours, MachineRun.Config(failureRate: 0));
        var interrupted = run.EventsOf(SpecElements.ProgramExecutionInterrupted).ToList();
        Assert.IsTrue(interrupted.Count > 3);
        Assert.IsFalse(run.EventsOf(SpecElements.JobOrderInterrupted).Any(), "without failures no job order is interrupted");
        Assert.HasCount(interrupted.Count, run.EventsOf(SpecElements.ProgramExecutionResumed).ToList());

        // The duration of an execution includes its interruptions.
        var starts = run.EventsOf(SpecElements.ProgramExecutionStarted).ToDictionary(e => e.Value["ExecutionId"]!.GetValue<string>(), e => e.Timestamp);
        var withStop = interrupted.Select(e => e.Value["ExecutionId"]!.GetValue<string>()).ToHashSet();
        var ended = run.EventsOf(SpecElements.ProgramExecutionEnded).Where(e => withStop.Contains(e.Value["ExecutionId"]!.GetValue<string>())).ToList();
        Assert.IsTrue(ended.Count > 0);
        foreach (var end in ended)
        {
            var duration = end.Value["Duration"]!.GetValue<double>();
            Assert.AreEqual((end.Timestamp - starts[end.Value["ExecutionId"]!.GetValue<string>()]).TotalSeconds, duration, 0.001);
            Assert.IsTrue(duration >= 20, "a stop of 20 seconds is part of the duration");
        }
    }

    [TestMethod]
    public void ProgramExecutionSnapshot_StaysAfterTheEnd()
    {
        var sawEnded = false;
        var sawAborted = false;
        string? lastStarted = null;
        MachineRun.For(SixHours, afterStep: (machine, step) =>
        {
            var started = step.OfType<SpecEvent>().LastOrDefault(e => e.Path == SpecElements.ProgramExecutionStarted);
            lastStarted = started?.Value["ExecutionId"]!.GetValue<string>() ?? lastStarted;
            var snapshot = machine.Values.Single(v => v.Path == SpecElements.ProgramExecution);
            if (lastStarted is null)
            {
                Assert.IsNull(snapshot.Value, "null only before the first program execution");
                return;
            }
            Assert.IsNotNull(snapshot.Value, $"never null after the first program execution, at {machine.Now:O}");
            Assert.AreEqual(lastStarted, snapshot.Value["ExecutionId"]!.GetValue<string>(), "the last program execution until the next begins");
            var state = snapshot.Value["State"]!.GetValue<string>();
            sawEnded |= state == "Ended";
            sawAborted |= state == "Aborted";
        });
        Assert.IsTrue(sawEnded && sawAborted);
    }

    [TestMethod]
    public void ProgramExecutionSnapshot_IsStampedWithItsLastChangeOfState()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var events = run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.ProgramExecution", StringComparison.Ordinal)).ToList();
        var snapshots = run.ValuesOf(SpecElements.ProgramExecution).Where(v => v.Value is not null).ToList();
        Assert.HasCount(events.Count, snapshots, "one snapshot per change of state");
        foreach (var (snapshot, specEvent) in snapshots.Zip(events))
        {
            Assert.AreEqual(specEvent.Timestamp, snapshot.Timestamp);
            Assert.AreEqual(specEvent.Value["State"]!.GetValue<string>(), snapshot.Value!["State"]!.GetValue<string>());
        }
    }

    [TestMethod]
    public void ProgramExecutionSnapshot_CarriesTheSumsFromItsEndUntilTheNextBegins()
    {
        var run = MachineRun.For(SixHours);
        var snapshots = run.ValuesOf(SpecElements.ProgramExecution).Where(v => v.Value is not null).ToList();
        var ends = run.Messages.OfType<SpecEvent>()
            .Where(e => e.Path is SpecElements.ProgramExecutionEnded or SpecElements.ProgramExecutionAborted)
            .ToDictionary(e => e.Value["ExecutionId"]!.GetValue<string>());
        Assert.IsTrue(ends.Count > 50);
        foreach (var snapshot in snapshots)
        {
            var value = snapshot.Value!.AsObject();
            var state = value["State"]!.GetValue<string>();
            Assert.IsTrue(value.ContainsKey("ActiveWorkMaster"));
            Assert.IsFalse(value.ContainsKey("ActiveProgram"));
            if (state is "Ended" or "Aborted")
            {
                // The snapshot at the end carries the same sums as the event.
                var end = ends[value["ExecutionId"]!.GetValue<string>()];
                Assert.IsTrue(JsonNode.DeepEquals(end.Value, value), $"{value}");
                foreach (var sum in new[] { "Duration", "PartsProduced", "EnergyElectricity" })
                {
                    Assert.IsTrue(value.ContainsKey(sum), sum);
                }
            }
            else
            {
                Assert.IsFalse(value.ContainsKey("Duration"), "no sums while it runs");
            }
        }

        // Between two program executions the last snapshot, with its sums, stands.
        var stood = 0;
        MachineRun.For(TimeSpan.FromHours(1), afterStep: (machine, _) =>
        {
            var current = machine.Values.Single(v => v.Path == SpecElements.ProgramExecution).Value;
            if (current?["State"]?.GetValue<string>() is "Ended" or "Aborted")
            {
                Assert.IsNotNull(current["Duration"]);
                stood++;
            }
        });
        Assert.IsTrue(stood > 100);
    }

    [TestMethod]
    public void ActiveWorkMaster_ReplacesTheActiveProgram()
    {
        Assert.AreEqual("Production.ActiveWorkMaster", SpecElements.ActiveWorkMaster);
        var run = MachineRun.For(TimeSpan.FromHours(1));
        Assert.IsTrue(run.ValuesOf(SpecElements.ActiveWorkMaster).Any());
        Assert.IsFalse(run.Messages.OfType<SpecValue>().Any(v => v.Path == "Production.ActiveProgram"));
        Assert.IsTrue(run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Production.ProgramExecution", StringComparison.Ordinal))
            .All(e => e.Value.ContainsKey("ActiveWorkMaster") && !e.Value.ContainsKey("ActiveProgram")));
    }

    [TestMethod]
    public void Alerts_CarryTheFieldsOfTheModel()
    {
        var run = MachineRun.For(SixHours);
        var alerts = run.ValuesOf(SpecElements.ActiveAlerts).SelectMany(v => v.Value!.AsArray().Select(a => a!.AsObject()))
            .Concat(run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Notification.", StringComparison.Ordinal)).Select(e => e.Value))
            .ToList();
        Assert.IsTrue(alerts.Count > 50);
        var allowed = new[] { "Id", "ErrorCode", "Message", "Severity", "SeverityValue", "Time", "SourceName", "correlationId" };
        foreach (var alert in alerts)
        {
            CollectionAssert.IsSubsetOf(alert.Select(p => p.Key).ToList(), allowed, alert.ToJsonString());
            foreach (var required in new[] { "Id", "ErrorCode", "Message", "Severity", "Time" })
            {
                Assert.IsTrue(alert.ContainsKey(required), $"{required} in {alert}");
            }
        }
        Assert.IsTrue(alerts.Any(a => a.ContainsKey("SeverityValue")) && alerts.Any(a => a.ContainsKey("SourceName")));
    }

    [TestMethod]
    public void Identification_CarriesTheNewElementsOfTheCore()
    {
        var run = MachineRun.For(TimeSpan.FromMinutes(1));
        var values = run.Messages.OfType<SpecValue>().GroupBy(v => v.Path).ToDictionary(g => g.Key, g => g.Last().Value);
        var scenario = MachineRun.Config().Scenario;
        Assert.AreEqual(scenario.Model, values[SpecElements.Model]!.GetValue<string>());
        Assert.AreEqual("https://example.com", values[SpecElements.ManufacturerUri]!.GetValue<string>());
        Assert.AreEqual(scenario.ProductCode, values[SpecElements.ProductCode]!.GetValue<string>());
        Assert.AreEqual((long)scenario.YearOfConstruction, values[SpecElements.YearOfConstruction]!.GetValue<long>());
        Assert.AreEqual(scenario.SoftwareRevision, values[SpecElements.SoftwareRevision]!.GetValue<string>());
        Assert.IsNotNull(values[SpecElements.PowerOnDuration]);
    }

    [TestMethod]
    public void UnavailableElement_IsNullOnceAndSaysSoInTheManifest()
    {
        var config = MachineRun.Config();
        config.Scenario.Unavailable = [SpecElements.Status, SpecElements.PowerOnDuration, SpecElements.YearOfConstruction];
        var run = MachineRun.For(TimeSpan.FromHours(2), config);

        foreach (var path in config.Scenario.Unavailable)
        {
            var published = run.ValuesOf(path).ToList();
            Assert.HasCount(1, published, $"{path} once");
            Assert.IsNull(published[0].Value, $"{path} null");
        }

        var identity = new MachineIdentity("Example Machine Tools", "P-04", "https://example.com/P-04");
        var elements = SpecManifest.Build(identity, config)["elements"]!.AsArray().Select(e => e!.AsObject()).ToList();
        var unavailable = elements.Where(e => e["available"]?.GetValue<bool>() == false).Select(e => e["path"]!.GetValue<string>()).ToList();
        CollectionAssert.AreEquivalent(config.Scenario.Unavailable, unavailable);

        // The rest of the machine runs on.
        Assert.IsTrue(run.EventsOf(SpecElements.ProgramExecutionEnded).Any());
        Assert.IsTrue(run.ValuesOf(SpecElements.ChannelState).Count() > 10);
    }

    [TestMethod]
    public void UnavailableAlerts_BringNoAlertEvents()
    {
        var config = MachineRun.Config();
        config.Scenario.Unavailable = [SpecElements.ActiveAlerts];
        var run = MachineRun.For(TimeSpan.FromHours(2), config);
        Assert.HasCount(1, run.ValuesOf(SpecElements.ActiveAlerts).ToList());
        Assert.IsFalse(run.Messages.OfType<SpecEvent>().Any(e => e.Path.StartsWith("Notification.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Unavailable_IsRefusedWhereTheModelDoesNotAllowIt()
    {
        var config = MachineRun.Config();
        config.Scenario.Unavailable = [SpecElements.Manufacturer];
        Assert.ThrowsExactly<ArgumentException>(() => MachineRun.For(TimeSpan.FromSeconds(1), config));
        CollectionAssert.AreEquivalent(
            new[] { SpecElements.Status, SpecElements.ActiveAlerts, SpecElements.PowerOnDuration, SpecElements.YearOfConstruction, SpecElements.SoftwareRevision },
            SpecElements.MayBeUnavailable.ToList());
    }

    [TestMethod]
    public void Event_GoesBelowTheEventsLevelWithSeqAndEpoch()
    {
        Assert.AreEqual("simulators/P-04/events/production", SpecWire.EventTopic("P-04", SpecElements.JobOrderChanged));
        Assert.AreEqual("simulators/P-04/events/production", SpecWire.EventTopic("P-04", SpecElements.ProgramExecutionStarted));
        Assert.AreEqual("simulators/P-04/events/notifications", SpecWire.EventTopic("P-04", SpecElements.AlertRaised));
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.EventTopic("P-04", "Maintenance.TaskDue"), "a group without a name");
        CollectionAssert.IsSubsetOf(SpecElements.Events.Select(e => e.Split('.')[0]).Distinct().ToList(), SpecWire.EventTopicNames.Keys.ToList(),
            "every event of the manifest has a topic");
        var wire = SpecWire.Event(new SpecEvent(SpecElements.AlertCleared, MachineRun.Start, 7, new JsonObject { ["Id"] = "a" }), "2026-11-17T06:00:00.000Z");
        CollectionAssert.AreEqual(new[] { "event", "timestamp", "seq", "seqEpoch", "value" }, wire.Select(p => p.Key).ToList());
        Assert.AreEqual(7, wire["seq"]!.GetValue<long>());
    }

    [TestMethod]
    public void BearingTemperature_IsASignalOfTheManufacturerInTheSameTree()
    {
        var path = SpecElements.ExtensionPath("example.com", SpecElements.BearingTemperature);
        Assert.AreEqual("x-example-com.Spindle.1.BearingTemperature", path);
        Assert.AreEqual("simulators/P-04/oem/Spindle/1/BearingTemperature", SpecWire.Topic("P-04", path), "the prefix maps to oem/");
        Assert.AreEqual("x-example-com", SpecElements.ExtensionPrefix("Example.COM"), "lower case, like the machine id");

        var run = MachineRun.For(TimeSpan.FromHours(1));
        var values = run.ValuesOf(path).ToList();
        Assert.IsTrue(values.Count > 100);
        Assert.IsTrue(values.All(v => v.Unit == SpecElements.UnitDegreeCelsius));
        Assert.AreEqual("degreeCelsius", (string?)SpecWire.Envelope(values[0])["unit"]);
    }

    [TestMethod]
    public void Oem_HoldsTheSignalsOfTheManufacturer_AtTheSamePlaceOfTheTree()
    {
        // The same place in the tree, only another namespace: the model and the manufacturer side by side.
        var model = SpecWire.Topic("P-04", SpecElements.SpindleIsRotating);
        var oem = SpecWire.Topic("P-04", "x-example-com.Spindle.1.BearingTemperature");
        Assert.AreEqual("simulators/P-04/umati/Spindle/1/IsRotating", model);
        Assert.AreEqual("simulators/P-04/oem/Spindle/1/BearingTemperature", oem);
        Assert.AreEqual(string.Join('/', model.Split('/')[3..5]), string.Join('/', oem.Split('/')[3..5]));

        // Every domain goes to oem/; the domain stays in the manifest only.
        Assert.AreEqual("simulators/P-04/oem/Process/DressingCount", SpecWire.Topic("P-04", "x-machines-example-org.Process.DressingCount"));
        Assert.IsFalse(oem.Contains("example", StringComparison.Ordinal), "no domain in the topic");
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.Topic("P-04", "x-.Spindle.1.BearingTemperature"));
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.Topic("P-04", "x-Example.Spindle.1.BearingTemperature"));
    }

    [TestMethod]
    public void Namespace_UmatiOemAndEvents_AreTheOnlyNames()
    {
        CollectionAssert.AreEquivalent(new[] { "umati", "oem", "events" }, SpecWire.ReservedNamespaces.ToList());

        // No topic of the virtual machine lies below another namespace.
        var run = MachineRun.For(TimeSpan.FromHours(1));
        var namespaces = run.Messages.OfType<SpecValue>().Select(v => SpecWire.Topic("P-04", v.Path).Split('/')[2])
            .Concat(run.Messages.OfType<SpecEvent>().Select(e => SpecWire.EventTopic("P-04", e.Path).Split('/')[2]))
            .Append(SpecWire.ManifestTopic("P-04").Split('/')[2])
            .ToHashSet();
        CollectionAssert.AreEquivalent(new[] { "umati", "oem", "events" }, namespaces.ToList());
    }

    [TestMethod]
    public void BearingTemperature_WarmsWhileTheSpindleTurnsAndCoolsWhileItStands()
    {
        var path = SpecElements.ExtensionPath("example.com", SpecElements.BearingTemperature);
        var scenario = MachineRun.Config().Scenario;
        var previous = (double?)null;
        var changed = true;
        var warmed = 0;
        var cooled = 0;
        MachineRun.For(SixHours, afterStep: (machine, step) =>
        {
            var values = machine.Values.ToDictionary(v => v.Path);
            var rotating = values[SpecElements.SpindleIsRotating].Value!.GetValue<bool>();
            changed |= step.OfType<SpecValue>().Any(v => v.Path == SpecElements.SpindleIsRotating);
            if (step.OfType<SpecValue>().FirstOrDefault(v => v.Path == path) is { } published)
            {
                var temperature = published.Value!.GetValue<double>();
                Assert.IsTrue(temperature >= scenario.BearingTemperatureIdle - 0.1 && temperature <= scenario.BearingTemperatureRunning * 1.1,
                    $"{temperature} at {machine.Now:O}");
                // Only where the spindle kept its state since the last measurement, rounding aside.
                if (previous is { } before && !changed)
                {
                    if (rotating)
                    {
                        warmed += temperature > before ? 1 : 0;
                        Assert.IsTrue(temperature >= before - 0.1 || before > scenario.BearingTemperatureIdle + ((scenario.BearingTemperatureRunning - scenario.BearingTemperatureIdle) * 0.9),
                            $"cools while the spindle turns at {machine.Now:O}");
                    }
                    else
                    {
                        cooled += temperature < before ? 1 : 0;
                        Assert.IsTrue(temperature <= before + 0.1, $"warms while the spindle stands at {machine.Now:O}");
                    }
                }
                previous = temperature;
                changed = false;
            }
        });
        Assert.IsTrue(warmed > 50 && cooled > 50, $"warmed {warmed}, cooled {cooled}");
    }

    [TestMethod]
    public void Manifest_NamesTypeUnitAndDescriptionOfTheSignalsOfTheManufacturer()
    {
        var identity = new MachineIdentity("Example Machine Tools", "P-04", "https://example.com/P-04");
        var elements = SpecManifest.Build(identity, MachineRun.Config())["elements"]!.AsArray().Select(e => e!.AsObject()).ToList();
        var extensions = elements.Where(e => e["path"]!.GetValue<string>().StartsWith("x-", StringComparison.Ordinal)).ToList();
        Assert.HasCount(SpecElements.Extensions.Count, extensions);
        foreach (var extension in extensions)
        {
            Assert.IsTrue(extension["path"]!.GetValue<string>().StartsWith("x-example-com.", StringComparison.Ordinal));
            Assert.IsNotNull(extension["type"]);
            Assert.IsNotNull(extension["unit"]!["code"]);
            Assert.IsNotNull(extension["description"]);
        }
        Assert.IsTrue(elements.Where(e => !e["path"]!.GetValue<string>().StartsWith("x-", StringComparison.Ordinal))
            .All(e => !e.ContainsKey("type") && !e.ContainsKey("unit")), "the model names type and unit of its own elements");
    }

    [TestMethod]
    public void Topics_LieBelowTheSerialNumberOfTheSimulator_SplitLikeThePlaygroundTree()
    {
        Assert.AreEqual("simulators/P-04/umati/Channel/1/ChannelState", SpecWire.Topic("P-04", "Channel.1.ChannelState"));
        Assert.AreEqual("simulators/P-04/umati/State/Status", SpecWire.Topic("P-04", SpecElements.Status));
        Assert.AreEqual("simulators/P-04/umati/Manifest", SpecWire.ManifestTopic("P-04"));
        Assert.AreEqual("simulators/P-04/oem/Spindle/1/BearingTemperature", SpecWire.Topic("P-04", "x-example-com.Spindle.1.BearingTemperature"));
        Assert.AreEqual("simulators/P-04/umati/Connection/State", SpecPublisher.LastWill("P-04", MachineRun.Start).Topic, "the last will");
    }

    [TestMethod]
    public void Manifest_NamesTheRetentionTheMachineChose_WithoutALeastTime()
    {
        var identity = new MachineIdentity("Example Machine Tools", "P-04", "https://example.com/P-04");
        Assert.AreEqual(86400.0, SpecManifest.Build(identity, MachineRun.Config())["jobOrderRetention"]!.GetValue<double>());
        Assert.AreEqual(3600.0, SpecManifest.Build(identity, MachineRun.Config(TimeSpan.FromHours(1)))["jobOrderRetention"]!.GetValue<double>());
        Assert.AreEqual(TimeSpan.FromHours(8), new ScenarioConfig().JobOrderRetention, "one shift by default");
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
            SpecEvent e => SpecWire.Event(e, run.Machine.SeqEpoch).ToJsonString(),
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
