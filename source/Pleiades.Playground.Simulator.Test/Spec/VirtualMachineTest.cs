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
        var failures = run.EventsOf(SpecElements.AlertRaised).Where(e => e.Value["severity"]!.GetValue<string>() == "Failure").ToList();
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
    public void Events_AreNumberedWithoutAGapFromOne()
    {
        var run = MachineRun.For(SixHours);
        var seqs = run.Messages.OfType<SpecEvent>().Select(e => e.Seq).ToList();
        Assert.IsTrue(seqs.Count > 100);
        CollectionAssert.AreEqual(Enumerable.Range(1, seqs.Count).Select(i => (long)i).ToList(), seqs);
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
    public void Event_GoesBelowTheEventsLevelWithSeqAndEpoch()
    {
        Assert.AreEqual("umati/example-com_P-04/events/Production", SpecWire.EventTopic("example-com_P-04", SpecElements.JobOrderChanged));
        Assert.AreEqual("umati/example-com_P-04/events/Production", SpecWire.EventTopic("example-com_P-04", SpecElements.ProgramExecutionStarted));
        Assert.AreEqual("umati/example-com_P-04/events/Notification", SpecWire.EventTopic("example-com_P-04", SpecElements.AlertRaised));
        var wire = SpecWire.Event(new SpecEvent(SpecElements.AlertCleared, MachineRun.Start, 7, new JsonObject { ["id"] = "a" }), "2026-11-17T06:00:00.000Z");
        CollectionAssert.AreEqual(new[] { "event", "timestamp", "seq", "seqEpoch", "value" }, wire.Select(p => p.Key).ToList());
        Assert.AreEqual(7, wire["seq"]!.GetValue<long>());
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
