// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

[TestClass]
public sealed class VirtualMachineTest
{
    private static readonly TimeSpan SixHours = TimeSpan.FromHours(6);

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
            Assert.IsNull(execution.CorrelationId, "The snapshot names its ExecutionId inside, without a correlationId");
            if (executionState is "Running" or "Interrupted")
            {
                Assert.AreEqual(MachineRun.Text(execution.Value, "ActiveWorkMaster"), values[SpecElements.ActiveWorkMaster].Value!.GetValue<string>());
                Assert.AreEqual(executionId, values[SpecElements.ActiveWorkMaster].CorrelationId);
            }
        });
        Assert.AreEqual((int)SixHours.TotalSeconds, steps);
    }

    [TestMethod]
    public void Advance_JobOrdersAndResults_CarryEveryField_AResultOnlyFromTheStart()
    {
        var run = MachineRun.For(SixHours);
        var workMasters = MachineRun.Config().Scenario.Jobs.Select(j => j.WorkMasterId).ToHashSet();
        var jobFields = new[] { "JobOrderID", "State", "StateSince", "JobName", "WorkMasterID", "OrderNumbers", "RunsPlanned", "JobExecutionMode", "PlannedStartTime", "PlannedEndTime" };
        var resultFields = new[] { "JobOrderID", "StartTime", "EndTime", "ProducedQuantity", "GoodQuantity", "RunsCompleted", "ActualProductionTime", "JobResult" };
        JsonArray jobs = [];
        var pairs = 0;
        foreach (var value in run.Messages.OfType<SpecValue>())
        {
            if (value.Path == SpecElements.JobOrders)
            {
                jobs = value.Value!.AsArray();
                foreach (var job in jobs.Select(j => j!.AsObject()))
                {
                    CollectionAssert.AreEquivalent(jobFields, job.Select(p => p.Key).ToList(), "every field, always");
                    Assert.IsTrue(workMasters.Contains(job["WorkMasterID"]!.GetValue<string>()));
                    Assert.IsNull(job["PlannedStartTime"], "the machine knows no planned times");
                }
                continue;
            }
            if (value.Path != SpecElements.JobOrderResults)
            {
                continue;
            }
            // The two lists come together; a result for each job order that started and is still listed.
            pairs++;
            var states = jobs.ToDictionary(j => j!["JobOrderID"]!.GetValue<string>(), j => j!["State"]!.GetValue<string>());
            var results = value.Value!.AsArray().Select(r => r!.AsObject()).ToList();
            foreach (var result in results)
            {
                CollectionAssert.AreEquivalent(resultFields, result.Select(p => p.Key).ToList(), "every field, always");
                var state = states[result["JobOrderID"]!.GetValue<string>()];
                Assert.AreNotEqual("NotAllowedToStart", state);
                Assert.AreNotEqual("AllowedToStart", state, "no result before the start");
                var ended = state is "Ended" or "Aborted";
                Assert.AreEqual(ended, result["EndTime"] is not null, $"EndTime is null until the end: {result}");
                Assert.AreEqual(ended, result["JobResult"]!.GetValue<string>() != "Unknown", $"JobResult is Unknown until the end: {result}");
                Assert.IsTrue(result["GoodQuantity"]!.GetValue<double>() <= result["ProducedQuantity"]!.GetValue<double>());
                Assert.AreEqual(result["ProducedQuantity"]!.GetValue<double>(), result["RunsCompleted"]!.GetValue<long>(), "one part per run");
            }
            var withResult = results.Select(r => r["JobOrderID"]!.GetValue<string>()).ToHashSet();
            Assert.IsTrue(states.Where(s => s.Value is "Running" or "Interrupted" or "Ended").All(s => withResult.Contains(s.Key)));
        }
        Assert.IsTrue(pairs > 50);
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

        // The last result of a job order holds the parts of all its executions.
        var lastEntries = run.EventsOf(SpecElements.JobOrderResultChanged)
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
                Assert.IsTrue(events.Any(e => e.Path == SpecElements.JobOrderAborted && e.Related is not null), "aborted after its start: it has a result");
                Assert.IsTrue(events.Any(e => e.Path == SpecElements.JobOrderResultChanged && e.Value["JobResult"]!.GetValue<string>() == "Unsuccessful"));
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
        var removed = run.EventsOf(SpecElements.JobOrderRemoved).Where(e => e.Related?["EndTime"] is not null).ToList();
        Assert.IsTrue(removed.Count > 3);
        foreach (var remove in removed)
        {
            var end = DateTimeOffset.Parse(remove.Related!["EndTime"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture);
            Assert.IsTrue(remove.Timestamp >= end + retention && remove.Timestamp < end + retention + TimeSpan.FromSeconds(2));
        }

        var kept = MachineRun.For(TimeSpan.FromHours(3));
        Assert.IsFalse(kept.EventsOf(SpecElements.JobOrderRemoved).Any(e => e.Related?["EndTime"] is not null),
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
        var paths = SpecElements.ElementsFor("alcyone-machines.example").Select(e => e.Path).ToHashSet();
        foreach (var value in run.Messages.OfType<SpecValue>())
        {
            Assert.IsTrue(paths.Contains(value.Path), value.Path);
            var envelope = SpecWire.Envelope(value);
            var isNumber = value.Value is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.Number;
            Assert.AreEqual(isNumber ? SpecElements.UnitOf(value.Path) : null, (string?)envelope["unit"], value.Path);
        }
        CollectionAssert.IsSubsetOf(SpecElements.Events.Select(e => e.Path).ToList(), run.Messages.OfType<SpecEvent>().Select(e => e.Path).Distinct().ToList());
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
        // sequence counts within each group of events, JobMonitoring, WorkMasterMonitoring and Notification apart.
        foreach (var group in run.Messages.OfType<SpecEvent>().GroupBy(e => SpecElements.EventGroup(e.Path)))
        {
            var seqs = group.Select(e => e.Seq).ToList();
            Assert.IsTrue(seqs.Count > 20, group.Key);
            CollectionAssert.AreEqual(Enumerable.Range(1, seqs.Count).Select(i => (long)i).ToList(), seqs, group.Key);
        }
        CollectionAssert.AreEquivalent(new[] { "JobMonitoring", "WorkMasterMonitoring", "Notification" },
            run.Messages.OfType<SpecEvent>().Select(e => SpecElements.EventGroup(e.Path)).Distinct().ToList());
        Assert.AreEqual("20261117T060000Z", run.Machine.SequencePrefix);
        foreach (var specEvent in run.Messages.OfType<SpecEvent>())
        {
            Assert.AreEqual(SpecWire.Sequence(run.Machine.SequencePrefix, specEvent.Seq), specEvent.Sequence);
        }
        var ids = run.Messages.OfType<SpecEvent>().Select(e => e.Id).ToList();
        Assert.AreEqual(ids.Count, ids.Distinct().Count(), "every event has an id of its own");
    }

    [TestMethod]
    public void JobOrderChangedAndResultChanged_NeverComeForARunningTimeAlone()
    {
        var run = MachineRun.For(SixHours);
        var lastJob = new Dictionary<string, JsonObject>();
        var lastResult = new Dictionary<string, JsonObject>();
        var changed = 0;
        var resultChanged = 0;
        foreach (var specEvent in run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("JobMonitoring.", StringComparison.Ordinal)))
        {
            var id = specEvent.Value["JobOrderID"]!.GetValue<string>();
            var discrete = (JsonObject)specEvent.Value.DeepClone();
            discrete.Remove("ActualProductionTime");
            if (specEvent.Path == SpecElements.JobOrderResultChanged)
            {
                resultChanged++;
                Assert.IsFalse(lastResult.TryGetValue(id, out var before) && JsonNode.DeepEquals(before, discrete),
                    $"JobOrderResultChanged without a discrete change: {specEvent.Value}");
                lastResult[id] = discrete;
                continue;
            }
            if (specEvent.Path == SpecElements.JobOrderChanged)
            {
                changed++;
                Assert.IsFalse(JsonNode.DeepEquals(lastJob[id], discrete), $"JobOrderChanged without a change: {specEvent.Value}");
                Assert.AreEqual(lastJob[id]["State"]!.GetValue<string>(), discrete["State"]!.GetValue<string>(), "JobOrderChanged never changes the state");
            }
            lastJob[id] = discrete;
        }
        Assert.IsTrue(resultChanged > 50, $"{resultChanged} results changed");
        Assert.IsTrue(changed > 0, "the planner changes the runs of a waiting job order");
    }

    [TestMethod]
    public void JobOrderEvents_Alone_GiveTheSameListsAsTheValues()
    {
        var run = MachineRun.For(SixHours, MachineRun.Config(TimeSpan.FromMinutes(20)));
        var jobs = new Dictionary<string, JsonObject>();
        var results = new Dictionary<string, JsonObject>();
        var compared = 0;
        foreach (var message in run.Messages)
        {
            switch (message)
            {
                case SpecEvent { Path: SpecElements.JobOrderAdded } added:
                    jobs.Add(added.Value["JobOrderID"]!.GetValue<string>(), added.Value);
                    break;
                case SpecEvent { Path: SpecElements.JobOrderStarted } started:
                    // A result comes with the start: from the start, nothing produced yet.
                    var startedId = started.Value["JobOrderID"]!.GetValue<string>();
                    jobs[startedId] = started.Value;
                    results.Add(startedId, new JsonObject
                    {
                        ["JobOrderID"] = startedId,
                        ["StartTime"] = started.Value["StateSince"]!.DeepClone(),
                        ["EndTime"] = null,
                        ["ProducedQuantity"] = 0.0,
                        ["GoodQuantity"] = 0.0,
                        ["RunsCompleted"] = 0L,
                        ["JobResult"] = "Unknown",
                    });
                    break;
                case SpecEvent { Path: SpecElements.JobOrderResultChanged } changed:
                    var changedId = changed.Value["JobOrderID"]!.GetValue<string>();
                    Assert.IsTrue(results.ContainsKey(changedId), "a result changes only once it is there");
                    results[changedId] = changed.Value;
                    break;
                case SpecEvent { Path: SpecElements.JobOrderRemoved } removed:
                    // ... and goes with its job order.
                    var removedId = removed.Value["JobOrderID"]!.GetValue<string>();
                    Assert.IsTrue(jobs.Remove(removedId));
                    results.Remove(removedId);
                    break;
                case SpecEvent other when other.Path.StartsWith("JobMonitoring.JobOrder", StringComparison.Ordinal):
                    jobs[other.Value["JobOrderID"]!.GetValue<string>()] = other.Value;
                    break;
                case SpecValue { Path: SpecElements.JobOrders } list:
                    AssertSameEntries(jobs, list);
                    compared++;
                    break;
                case SpecValue { Path: SpecElements.JobOrderResults } list:
                    AssertSameEntries(results, list);
                    break;
                default:
                    break;
            }
        }
        Assert.IsTrue(compared > 50);
    }

    private static void AssertSameEntries(Dictionary<string, JsonObject> replayed, SpecValue list)
    {
        var entries = list.Value!.AsArray().Select(e => e!.AsObject()).ToList();
        Assert.HasCount(entries.Count, replayed, $"{list.Path} at {list.Timestamp:O}");
        foreach (var entry in entries)
        {
            var id = entry["JobOrderID"]!.GetValue<string>();
            var expected = (JsonObject)entry.DeepClone();
            var actual = (JsonObject)replayed[id].DeepClone();
            expected.Remove("ActualProductionTime");
            actual.Remove("ActualProductionTime");
            Assert.IsTrue(JsonNode.DeepEquals(expected, actual), $"{list.Path} {id} at {list.Timestamp:O}: {expected} / {actual}");
        }
    }

    [TestMethod]
    public void JobOrderEvents_FollowTheTransitionsOfTheirState()
    {
        var run = MachineRun.For(SixHours, MachineRun.Config(TimeSpan.FromMinutes(20)));
        var states = new Dictionary<string, string>();
        var seen = new HashSet<string>();
        foreach (var specEvent in run.Messages.OfType<SpecEvent>()
            .Where(e => e.Path.StartsWith("JobMonitoring.JobOrder", StringComparison.Ordinal) && e.Path != SpecElements.JobOrderResultChanged))
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
                Assert.IsNull(specEvent.Related, "A cancelled job order never ran: it has no result");
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
        foreach (var specEvent in run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("WorkMasterMonitoring.ProgramExecution", StringComparison.Ordinal)))
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
        var events = run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("WorkMasterMonitoring.ProgramExecution", StringComparison.Ordinal)).ToList();
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
    public void Paths_FollowTheProfiles()
    {
        Assert.AreEqual("WorkMasterMonitoring.ActiveWorkMaster", SpecElements.ActiveWorkMaster);
        Assert.AreEqual("JobMonitoring.JobOrders", SpecElements.JobOrders);
        var run = MachineRun.For(TimeSpan.FromHours(1));
        Assert.IsTrue(run.ValuesOf(SpecElements.ActiveWorkMaster).Any());
        Assert.IsFalse(run.Messages.Any(m => m.Path.StartsWith("Production.", StringComparison.Ordinal)), "no path below Production");
        Assert.IsTrue(run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("WorkMasterMonitoring.ProgramExecution", StringComparison.Ordinal))
            .All(e => e.Value.ContainsKey("ActiveWorkMaster") && !e.Value.ContainsKey("ActiveProgram")));
    }

    [TestMethod]
    public void Alerts_CarryTheFieldsOfTheModel()
    {
        var run = MachineRun.For(SixHours);
        var alerts = run.ValuesOf(SpecElements.ActiveAlerts).SelectMany(v => v.Value!.AsArray().Select(a => a!.AsObject()))
            .Concat(run.Messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("Notification.Alert", StringComparison.Ordinal)).Select(e => e.Value))
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
    public void WorkMaster_IsAnIdOfItsOwn_AndTheProgramASignalOfTheManufacturer()
    {
        var run = MachineRun.For(TimeSpan.FromHours(2));
        var program = SpecElements.ExtensionPath("alcyone-machines.example", SpecElements.ActiveProgram);
        var started = run.EventsOf(SpecElements.ProgramExecutionStarted).First();
        var template = MachineRun.Config().Scenario.Jobs.Single(j => j.WorkMasterId == started.Value["ActiveWorkMaster"]!.GetValue<string>());

        Assert.AreEqual("WM-SHAFT-4711", new JobTemplate { Program = "shaft-4711.mpf", WorkMaster = "WM-SHAFT-4711" }.WorkMasterId);
        Assert.AreEqual("WM-SHAFT", new JobTemplate().WorkMasterId, "made from the program without one");
        var workMaster = run.ValuesOf(SpecElements.ActiveWorkMaster).Last(v => v.Timestamp <= started.Timestamp);
        Assert.AreEqual(template.WorkMasterId, workMaster.Value!.GetValue<string>());
        Assert.AreEqual(started.CorrelationId, workMaster.CorrelationId, "while it runs, the work master carries the ExecutionId");
        var activeProgram = run.ValuesOf(program).Last(v => v.Timestamp <= started.Timestamp);
        Assert.AreEqual(template.Program, activeProgram.Value!.GetValue<string>());
        Assert.IsNull(activeProgram.CorrelationId);
        Assert.IsTrue(run.Messages.OfType<SpecEvent>().All(e => !e.Value.ToJsonString().Contains(".MPF", StringComparison.Ordinal)),
            "no event carries the program");
    }

    [TestMethod]
    public void ChannelAndSpindle_DeliverTheirProfilesWhole()
    {
        var run = MachineRun.For(SixHours);
        var feed = run.ValuesOf(SpecElements.FeedOverride).Select(v => (v.Timestamp, v.Value!.GetValue<double>())).ToList();
        var channelFeed = run.ValuesOf(SpecElements.ChannelFeedOverride).Select(v => (v.Timestamp, v.Value!.GetValue<double>())).ToList();
        Assert.IsTrue(feed.Count > 1);
        CollectionAssert.AreEqual(feed, channelFeed, "one channel: its feed override is the one of the machine");

        var modes = run.ValuesOf(SpecElements.ChannelMode).Select(v => v.Value!.GetValue<string>()).ToList();
        CollectionAssert.AreEquivalent(new[] { "Automatic", "JogManual" }, modes.Distinct().ToList(), "manual while it is set up");
        Assert.AreEqual(1.0, run.ValuesOf(SpecElements.RapidOverride).Single().Value!.GetValue<double>());
        Assert.AreEqual("CHAN1", run.ValuesOf(SpecElements.ChannelName).Single().Value!.GetValue<string>());
        Assert.IsFalse(run.ValuesOf(SpecElements.SpindleIsUsedAsAxis).Single().Value!.GetValue<bool>());
        Assert.AreEqual("S1", run.ValuesOf(SpecElements.SpindleName).Single().Value!.GetValue<string>());
    }

    [TestMethod]
    public void OperationDuration_GrowsOnlyWhileAProgramRuns()
    {
        var run = MachineRun.For(SixHours);
        var operation = run.ValuesOf(SpecElements.OperationDuration).Select(v => v.Value!.GetValue<double>()).ToList();
        var powerOn = run.ValuesOf(SpecElements.PowerOnDuration).Select(v => v.Value!.GetValue<double>()).ToList();
        Assert.IsTrue(operation.Zip(operation.Skip(1)).All(p => p.Second >= p.First), "it only grows");
        var operated = operation[^1] - operation[0];
        Assert.IsTrue(operated > 0 && operated < powerOn[^1] - powerOn[0], "a part of the power-on duration");

        var executions = run.EventsOf(SpecElements.ProgramExecutionEnded).Concat(run.EventsOf(SpecElements.ProgramExecutionAborted))
            .Sum(e => e.Value["Duration"]!.GetValue<double>());
        Assert.IsTrue(operated <= executions + 60, $"no more than the program executions: {operated} s, {executions} s");
        Assert.AreEqual(run.Machine.Counters.OperationDuration, operation[^1], 60, "kept with the counters");
    }

    [TestMethod]
    public void WarmUp_HoldsTheFirstJobOrderBack()
    {
        var config = MachineRun.Config();
        var warmUp = new ScenarioConfig
        {
            Seed = config.Scenario.Seed,
            Jobs = config.Scenario.Jobs,
            WarmUpTime = TimeSpan.FromMinutes(10),
        };
        var run = MachineRun.For(TimeSpan.FromHours(1), new SpecOutputConfig { Scenario = warmUp });

        var isWarmUp = run.ValuesOf(SpecElements.IsWarmUp).ToList();
        Assert.HasCount(2, isWarmUp);
        Assert.IsTrue(isWarmUp[0].Value!.GetValue<bool>());
        Assert.IsFalse(isWarmUp[1].Value!.GetValue<bool>());
        Assert.AreEqual(MachineRun.Start.AddMinutes(10), isWarmUp[1].Timestamp);
        Assert.IsTrue(run.EventsOf(SpecElements.JobOrderStarted).First().Timestamp >= isWarmUp[1].Timestamp);
        Assert.IsFalse(MachineRun.For(TimeSpan.FromMinutes(1)).ValuesOf(SpecElements.IsWarmUp).Single().Value!.GetValue<bool>(), "no warm-up by default");
    }

    [TestMethod]
    public void Software_IsAListOfComponents()
    {
        var run = MachineRun.For(TimeSpan.FromMinutes(1));
        var software = run.ValuesOf(SpecElements.Software).Single().Value!.AsArray().Select(s => s!.AsObject()).ToList();

        Assert.IsTrue(software.Count >= 2);
        foreach (var entry in software)
        {
            CollectionAssert.AreEqual(new[] { "Manufacturer", "ComponentName", "SoftwareRevision" }, entry.Select(p => p.Key).ToList());
            Assert.IsFalse(string.IsNullOrWhiteSpace((string?)entry["ComponentName"]));
        }
        Assert.AreEqual(software.Count, software.Select(s => $"{s["Manufacturer"]}/{s["ComponentName"]}").Distinct().Count(), "Manufacturer and ComponentName name an entry");
        Assert.AreEqual("machines/P-04/umati/Components/Software", SpecWire.Topic("P-04", SpecElements.Software));
    }

    [TestMethod]
    public void ProgramStop_GivesANotificationOfThatProgramExecution()
    {
        var run = MachineRun.For(SixHours);
        var notifications = run.EventsOf(SpecElements.NotificationEvent).ToList();
        Assert.IsNotEmpty(notifications);
        foreach (var notification in notifications)
        {
            Assert.IsFalse(notification.Value.ContainsKey("Severity"), "a notification has no category");
            Assert.AreEqual("M00", notification.Value["ErrorCode"]!.GetValue<string>());
            Assert.AreEqual(notification.CorrelationId, notification.Value["correlationId"]!.GetValue<string>());
            var interrupted = run.EventsOf(SpecElements.ProgramExecutionInterrupted).Single(e => e.Timestamp == notification.Timestamp);
            Assert.AreEqual(interrupted.CorrelationId, notification.CorrelationId);
        }
    }

    [TestMethod]
    public void CommunicationFaults_FallAtTheEndOfEveryInterval_AndAreOffByDefault()
    {
        var faults = new CommunicationFaults(TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(1), MachineRun.Start);
        Assert.IsFalse(faults.IsFaulted(MachineRun.Start));
        Assert.IsFalse(faults.IsFaulted(MachineRun.Start.AddMinutes(28.9)));
        Assert.IsTrue(faults.IsFaulted(MachineRun.Start.AddMinutes(29)));
        Assert.IsTrue(faults.IsFaulted(MachineRun.Start.AddMinutes(29.9)));
        Assert.IsFalse(faults.IsFaulted(MachineRun.Start.AddMinutes(30)));
        Assert.IsTrue(faults.IsFaulted(MachineRun.Start.AddMinutes(59.5)));

        Assert.IsNull(new ScenarioConfig().CommunicationFaultInterval);
        var never = new CommunicationFaults(null, TimeSpan.FromMinutes(1), MachineRun.Start);
        Assert.IsFalse(Enumerable.Range(0, 1440).Any(m => never.IsFaulted(MachineRun.Start.AddMinutes(m))));
    }

    [TestMethod]
    public void Identification_CarriesTheNewElementsOfTheCore()
    {
        var run = MachineRun.For(TimeSpan.FromMinutes(1));
        var values = run.Messages.OfType<SpecValue>().GroupBy(v => v.Path).ToDictionary(g => g.Key, g => g.Last().Value);
        var scenario = MachineRun.Config().Scenario;
        Assert.AreEqual(scenario.Model, values[SpecElements.Model]!.GetValue<string>());
        Assert.AreEqual("https://alcyone-machines.example", values[SpecElements.ManufacturerUri]!.GetValue<string>());
        Assert.AreEqual(scenario.ProductCode, values[SpecElements.ProductCode]!.GetValue<string>());
        Assert.AreEqual((long)scenario.YearOfConstruction, values[SpecElements.YearOfConstruction]!.GetValue<long>());
        Assert.IsFalse(values.ContainsKey("Identification.SoftwareRevision"), "no revision of the whole machine since 0.17.0");
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

        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
        var elements = SpecManifest.Build(identity, config)["elements"]!.AsArray().Select(e => e!.AsObject()).ToList();
        var unavailable = elements.Where(e => e["available"]?.GetValue<bool>() == false).Select(e => e["path"]!.GetValue<string>()).ToList();
        CollectionAssert.AreEquivalent(config.Scenario.Unavailable.Concat(SpecElements.NotDelivered).ToList(), unavailable,
            "the scenario's own and what the virtual machine never delivers");

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
        foreach (var path in new[] { SpecElements.Manufacturer, SpecElements.SerialNumber, SpecElements.ProductInstanceUri, SpecElements.Heartbeat, SpecElements.ConnectionState })
        {
            var config = MachineRun.Config();
            config.Scenario.Unavailable = [path];
            Assert.ThrowsExactly<ArgumentException>(() => MachineRun.For(TimeSpan.FromSeconds(1), config), path);
        }
        CollectionAssert.AreEquivalent(
            SpecElements.Elements.Select(e => e.Path).Except(SpecElements.AlwaysAvailable).ToList(),
            SpecElements.MayBeUnavailable.ToList(), "every element but the five");

        var feedOverride = MachineRun.Config();
        feedOverride.Scenario.Unavailable = [SpecElements.FeedOverride];
        var run = MachineRun.For(TimeSpan.FromMinutes(10), feedOverride);
        Assert.IsTrue(run.ValuesOf(SpecElements.FeedOverride).All(v => v.Value is null), "a machine without a feed override");
    }

    [TestMethod]
    public void Event_GoesBelowTheEventsLevelAsACloudEvent()
    {
        Assert.AreEqual("machines/P-04/events/jobs", SpecWire.EventTopic("P-04", SpecElements.JobOrderChanged));
        Assert.AreEqual("machines/P-04/events/jobs", SpecWire.EventTopic("P-04", SpecElements.JobOrderResultChanged));
        Assert.AreEqual("machines/P-04/events/workmasters", SpecWire.EventTopic("P-04", SpecElements.ProgramExecutionStarted));
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.EventTopic("P-04", "Production.JobOrderChanged"), "no group Production since 0.17.0");
        Assert.AreEqual("machines/P-04/events/notifications", SpecWire.EventTopic("P-04", SpecElements.AlertRaised));
        Assert.ThrowsExactly<ArgumentException>(() => SpecWire.EventTopic("P-04", "Maintenance.TaskDue"), "a group without a name");
        CollectionAssert.IsSubsetOf(SpecElements.Events.Select(e => e.Path.Split('.')[0]).Distinct().ToList(), SpecWire.EventTopicNames.Keys.ToList(),
            "every event of the manifest has a topic");

        var id = SpecWire.NameUuid("https://www.alcyone-machines.example/GM-500/P-04 Notification 20261117T060000Z.000000000007");
        var specEvent = new SpecEvent(SpecElements.AlertCleared, MachineRun.Start, 7, new JsonObject { ["Id"] = "a" }, id,
            SpecWire.Sequence("20261117T060000Z", 7), "exec-1");
        var wire = SpecWire.Event(specEvent, "https://www.alcyone-machines.example/GM-500/P 04");
        CollectionAssert.AreEqual(new[] { "specversion", "id", "source", "type", "time", "sequence", "correlationid", "dataschema", "data" },
            wire.Select(p => p.Key).ToList());
        Assert.AreEqual("1.0", wire["specversion"]!.GetValue<string>());
        Assert.AreEqual(id, wire["id"]!.GetValue<string>());
        Assert.AreEqual(5, Guid.Parse(id).Version, "a UUID made from a name");
        Assert.AreEqual("https://www.alcyone-machines.example/GM-500/P%2004", wire["source"]!.GetValue<string>(), "a space is encoded");
        Assert.AreEqual(SpecElements.AlertCleared, wire["type"]!.GetValue<string>());
        Assert.AreEqual("2026-11-17T06:00:00.000Z", wire["time"]!.GetValue<string>());
        Assert.AreEqual("20261117T060000Z.000000000007", wire["sequence"]!.GetValue<string>());
        Assert.AreEqual("exec-1", wire["correlationid"]!.GetValue<string>());
        Assert.AreEqual("urn:umati2:datamodel:0.17.1:event.schema.json", wire["dataschema"]!.GetValue<string>());
        Assert.AreEqual("a", wire["data"]!["Id"]!.GetValue<string>());

        var withoutCorrelation = SpecWire.Event(specEvent with { CorrelationId = null }, "https://www.alcyone-machines.example/GM-500/P-04");
        Assert.IsFalse(withoutCorrelation.ContainsKey("correlationid"), "only where the event belongs to a program execution");
    }

    [TestMethod]
    public void BearingTemperature_IsASignalOfTheManufacturerInTheSameTree()
    {
        var path = SpecElements.ExtensionPath("alcyone-machines.example", SpecElements.BearingTemperature);
        Assert.AreEqual("x-alcyone-machines-example.Spindle.1.BearingTemperature", path);
        Assert.AreEqual("machines/P-04/oem/Spindle/1/BearingTemperature", SpecWire.Topic("P-04", path), "the prefix maps to oem/");
        Assert.AreEqual("x-alcyone-machines-example", SpecElements.ExtensionPrefix("Alcyone-Machines.EXAMPLE"), "lower case, like the machine id");

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
        var oem = SpecWire.Topic("P-04", "x-alcyone-machines-example.Spindle.1.BearingTemperature");
        Assert.AreEqual("machines/P-04/umati/Spindle/1/IsRotating", model);
        Assert.AreEqual("machines/P-04/oem/Spindle/1/BearingTemperature", oem);
        Assert.AreEqual(string.Join('/', model.Split('/')[3..5]), string.Join('/', oem.Split('/')[3..5]));

        // Every domain goes to oem/; the domain stays in the manifest only.
        Assert.AreEqual("machines/P-04/oem/Process/DressingCount", SpecWire.Topic("P-04", "x-machines-example-org.Process.DressingCount"));
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
        var path = SpecElements.ExtensionPath("alcyone-machines.example", SpecElements.BearingTemperature);
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
        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
        var elements = SpecManifest.Build(identity, MachineRun.Config())["elements"]!.AsArray().Select(e => e!.AsObject()).ToList();
        var extensions = elements.Where(e => e["path"]!.GetValue<string>().StartsWith("x-", StringComparison.Ordinal)).ToList();
        Assert.HasCount(SpecElements.Extensions.Count, extensions);
        foreach (var extension in extensions)
        {
            Assert.IsTrue(extension["path"]!.GetValue<string>().StartsWith("x-alcyone-machines-example.", StringComparison.Ordinal));
            Assert.IsNotNull(extension["type"]);
            Assert.AreEqual(extension["type"]!.GetValue<string>() == "number", extension["unit"]?["code"] is not null, "a number has a unit, a text none");
            Assert.IsNotNull(extension["description"]);
        }
        Assert.IsTrue(elements.Where(e => !e["path"]!.GetValue<string>().StartsWith("x-", StringComparison.Ordinal))
            .All(e => !e.ContainsKey("type") && !e.ContainsKey("unit")), "the model names type and unit of its own elements");
    }

    [TestMethod]
    [DataRow("https://www.alcyone-machines.example", "AX-400", "P-04", "alcyone-machines_AX-400_P-04")]
    [DataRow("https://www.taygeta-precision.example", "TP-800", "P-07", "taygeta-precision_TP-800_P-07")]
    [DataRow("https://www.merope-microtec.example", "MM-120", "M-02", "merope-microtec_MM-120_M-02")]
    [DataRow("https://alcyone-machines.example/products", "AX-400", "P-04", "alcyone-machines_AX-400_P-04")]
    [DataRow("https://WWW.Alcyone-Machines.EXAMPLE", "AX-400", "P-04", "alcyone-machines_AX-400_P-04")]
    [DataRow("https://machines.example.co.uk", "AX-400", "P-04", "machines-example-co_AX-400_P-04")]
    [DataRow("https://localhost", "AX-400", "P-04", "localhost_AX-400_P-04")]
    [DataRow("https://müller-maschinen.de", "Schleifer 5/2", "SN 0815#a", "mueller-maschinen_Schleifer-5-2_SN-0815-a")]
    [DataRow("https://www.alcyone-machines.example", "Größe Ä Ö Ü", "Café_01", "alcyone-machines_Groesse-Ae-Oe-Ue_Cafe-01")]
    [DataRow("https://www.alcyone-machines.example", "--a  +  b--", "x//y", "alcyone-machines_a-b_x-y")]
    [DataRow("alcyone machine works", "", "  ", "alcyone-machine-works_unknown_unknown")]
    public void MachineId_IsManufacturerModelAndSerialNumber_EachPartNormalised(string manufacturerAddress, string model, string serialNumber, string expected)
    {
        Assert.AreEqual(expected, SpecWire.MachineId(manufacturerAddress, model, serialNumber));
    }

    [TestMethod]
    public void MachineIdPart_IsAtMost64Characters_WithoutASeparatorOrAWildcard()
    {
        var part = SpecWire.MachineIdPart(new string('A', 70) + "_+/#.");
        Assert.HasCount(64, part);
        Assert.AreEqual(new string('A', 64), part);
        Assert.AreEqual(new string('x', 63), SpecWire.MachineIdPart(new string('x', 63) + "-yz"), "a cut part ends without a hyphen");
        foreach (var bad in new[] { "_", "+", "#", "/", ".", " " })
        {
            Assert.IsFalse(SpecWire.MachineId("https://a.b", $"m{bad}x", $"s{bad}y").Split('_').Any(p => p.Contains(bad, StringComparison.Ordinal)), bad);
        }
        Assert.HasCount(3, SpecWire.MachineId("https://a.b", "m_x", "s_y").Split('_'), "_ separates the three parts only");
    }

    [TestMethod]
    public void MachineId_OfEveryScenario_NamesTheManifestTheTopicsAndTheLastWill()
    {
        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
        var config = MachineRun.Config();
        var machineId = SpecManifest.MachineId(identity, config);

        Assert.AreEqual($"alcyone-machines_{config.Scenario.Model}_P-04", machineId);
        Assert.AreEqual(machineId, SpecManifest.Build(identity, config)["machineId"]!.GetValue<string>());
        Assert.AreEqual($"machines/{machineId}/umati/Connection/State", SpecPublisher.LastWill(machineId, MachineRun.Start).Topic);
        Assert.AreEqual($"machines/{machineId}/events/jobs", SpecWire.EventTopic(machineId, SpecElements.JobOrderAdded));
        Assert.AreEqual($"machines/{machineId}/oem/Spindle/1/BearingTemperature",
            SpecWire.Topic(machineId, SpecElements.ExtensionPath("alcyone-machines.example", SpecElements.BearingTemperature)));
    }

    [TestMethod]
    public void Topics_LieBelowTheMachineIdOfTheSimulator_SplitLikeThePlaygroundTree()
    {
        Assert.AreEqual("machines/P-04/umati/Channel/1/ChannelState", SpecWire.Topic("P-04", "Channel.1.ChannelState"));
        Assert.AreEqual("machines/P-04/umati/State/Status", SpecWire.Topic("P-04", SpecElements.Status));
        Assert.AreEqual("machines/P-04/umati/Manifest", SpecWire.ManifestTopic("P-04"));
        Assert.AreEqual("machines/P-04/oem/Spindle/1/BearingTemperature", SpecWire.Topic("P-04", "x-alcyone-machines-example.Spindle.1.BearingTemperature"));
        Assert.AreEqual("machines/P-04/umati/Connection/State", SpecPublisher.LastWill("P-04", MachineRun.Start).Topic, "the last will");
    }

    [TestMethod]
    public void Manifest_NamesTheRetentionTheMachineChose_WithoutALeastTime()
    {
        var identity = new MachineIdentity("Alcyone Machine Works", "P-04", "https://www.alcyone-machines.example/GM-500/P-04");
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
            SpecEvent e => SpecWire.Event(e, "https://www.alcyone-machines.example/GM-500/P-04").ToJsonString(),
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
