// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>A job order that passes several machines in turn, under one JobOrderID.</summary>
[TestClass]
public sealed class RouteTest
{
    private const string First = "alcyone-machines_GM-500_A";
    private const string Second = "alcyone-machines_GM-500_B";
    private const string Third = "alcyone-machines_GM-500_C";

    [TestMethod]
    public void FirstStep_AddsTheRouteJobOrderAtTheStart_ReleasedAndFirstToStart()
    {
        var config = WithRoute();
        var machine = Machine("A", config);
        var initial = machine.TakeInitialMessages();
        var messages = new List<SpecMessage>(initial);
        for (var now = MachineRun.Start.AddSeconds(1); now <= MachineRun.Start.AddMinutes(3); now = now.AddSeconds(1))
        {
            messages.AddRange(machine.Advance(now));
        }

        var routeEvents = EventsOf(messages, "90001/01");
        CollectionAssert.AreEqual(
            new[] { SpecElements.JobOrderAdded, SpecElements.JobOrderReleased, SpecElements.JobOrderStarted },
            routeEvents.Select(e => e.Path).Where(p => p != SpecElements.JobOrderResultChanged).Take(3).ToArray());
        var entry = routeEvents[0].Value;
        Assert.AreEqual("Route turning", entry["JobName"]!.GetValue<string>());
        Assert.AreEqual("WM-R10", entry["WorkMasterID"]!.GetValue<string>());
        Assert.AreEqual(4, entry["RunsPlanned"]!.GetValue<long>());
        Assert.AreEqual("SO-90001", entry["OrderNumbers"]![0]!.GetValue<string>());
        Assert.IsFalse(messages.OfType<SpecEvent>().Any(e => e.Path == SpecElements.JobOrderStarted && Id(e) != "90001/01"),
            "the route job order goes before the own queue");
    }

    [TestMethod]
    public void FirstStep_AddsNoNextWhileOneWaits_AndKeepsTheOwnQueueAsItWas()
    {
        var config = WithRoute(interval: TimeSpan.FromMinutes(5));
        var run = Run(Machine("A", config), TimeSpan.FromHours(2));

        var added = run.OfType<SpecEvent>().Where(e => e.Path == SpecElements.JobOrderAdded && IsRoute(Id(e))).ToList();
        Assert.IsGreaterThan(1, added.Count, "a route job order every interval");
        foreach (var list in run.OfType<SpecValue>().Where(v => v.Path == SpecElements.JobOrders))
        {
            var entries = list.Value!.AsArray();
            var waitingRoute = entries.Count(e => IsRoute(Id(e!)) && State(e!) is "NotAllowedToStart" or "AllowedToStart");
            Assert.IsLessThanOrEqualTo(1, waitingRoute, "no next one while one waits");
            var waitingOwn = entries.Count(e => !IsRoute(Id(e!)) && State(e!) is "NotAllowedToStart" or "AllowedToStart");
            Assert.IsLessThanOrEqualTo(2, waitingOwn, $"the own queue stays as long as it was: {list.Timestamp:O} {list.Value.ToJsonString()}");
        }
    }

    [TestMethod]
    public void NextStep_AddsItsStepWhenTheJobOrderShowsUpBefore_ReleasesItWithTheGoodParts()
    {
        var machine = Machine("B", WithRoute());
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());

        machine.ObserveUpstream(First, [Upstream("90001/01", "Running", good: 2, final: false)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(1)));
        var added = EventsOf(messages, "90001/01").Single();
        Assert.AreEqual(SpecElements.JobOrderAdded, added.Path);
        Assert.AreEqual("NotAllowedToStart", State(added.Value));
        Assert.AreEqual("WM-R20", added.Value["WorkMasterID"]!.GetValue<string>());

        // Ended, but the good parts are not final until the result has its end.
        machine.ObserveUpstream(First, [Upstream("90001/01", "Ended", good: 3, final: false)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(2)));
        Assert.HasCount(1, EventsOf(messages, "90001/01"));

        machine.ObserveUpstream(First, [Upstream("90001/01", "Ended", good: 3, final: true)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(3)));
        var events = EventsOf(messages, "90001/01");
        Assert.AreEqual(SpecElements.JobOrderChanged, events[1].Path);
        Assert.AreEqual(3, events[1].Value["RunsPlanned"]!.GetValue<long>());
        Assert.AreEqual(SpecElements.JobOrderReleased, events[2].Path);

        // The same list again changes nothing.
        machine.ObserveUpstream(First, [Upstream("90001/01", "Ended", good: 3, final: true)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(4)));
        Assert.HasCount(3, EventsOf(messages, "90001/01").Where(e => e.Path != SpecElements.JobOrderStarted && e.Path != SpecElements.JobOrderResultChanged));
    }

    [TestMethod]
    [DataRow("Aborted", 0.0, false)]
    [DataRow("Ended", 0.0, true)]
    public void NextStep_CancelsItsStep_WhenTheStepBeforeWasAbortedOrMadeNoGoodPart(string state, double good, bool final)
    {
        var machine = Machine("B", WithRoute());
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        machine.ObserveUpstream(First, [Upstream("90001/01", "Running", good: 0, final: false)]);
        machine.ObserveUpstream(First, [Upstream("90001/01", state, good: good, final: final)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(1)));

        var events = EventsOf(messages, "90001/01");
        CollectionAssert.AreEqual(new[] { SpecElements.JobOrderAdded, SpecElements.JobOrderCancelled }, events.Select(e => e.Path).ToArray());
    }

    [TestMethod]
    public void NextStep_CancelsItsStep_WhenTheJobOrderLeavesTheListBeforeItEnded()
    {
        var machine = Machine("B", WithRoute());
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        machine.ObserveUpstream(First, [Upstream("90001/01", "AllowedToStart", good: null, final: false)]);
        machine.ObserveUpstream(First, []);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(1)));

        Assert.AreEqual(SpecElements.JobOrderCancelled, EventsOf(messages, "90001/01")[^1].Path);
    }

    [TestMethod]
    public void NextStep_TakesNothingAlreadyAbortedAndNoJobOrderOfAnotherWorkMaster()
    {
        var machine = Machine("B", WithRoute());
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        machine.ObserveUpstream(First, [
            Upstream("90001/01", "Aborted", good: 1, final: true),
            new UpstreamJobOrder("1234/01", "Ended", "WM-SHAFT", 5, 5, true),
        ]);
        machine.ObserveUpstream(Third, [Upstream("90002/01", "Ended", good: 4, final: true)]);
        messages.AddRange(machine.Advance(MachineRun.Start.AddSeconds(1)));

        Assert.IsEmpty(EventsOf(messages, "90001/01"));
        Assert.IsEmpty(EventsOf(messages, "1234/01"));
        Assert.IsEmpty(EventsOf(messages, "90002/01"), "only the machine before this one counts");
    }

    [TestMethod]
    public void AfterARestart_AJobOrderIsNotTakenTwice_AndTheRouteNumbersGoOn()
    {
        var config = WithRoute();
        var second = Machine("B", config);
        second.ObserveUpstream(First, [Upstream("90001/01", "Ended", good: 4, final: true)]);
        Assert.IsTrue(second.RouteStateChanged);
        var secondState = second.TakeRouteState();
        Assert.IsFalse(second.RouteStateChanged);

        var restarted = Machine("B", config, secondState);
        var messages = new List<SpecMessage>(restarted.TakeInitialMessages());
        restarted.ObserveUpstream(First, [Upstream("90001/01", "Ended", good: 4, final: true)]);
        messages.AddRange(restarted.Advance(MachineRun.Start.AddSeconds(1)));
        Assert.IsEmpty(EventsOf(messages, "90001/01"));

        var first = Machine("A", config);
        var firstState = first.TakeRouteState();
        Assert.AreEqual(90002, firstState.NextJobOrderNumbers["Valve"]);
        var again = Machine("A", config, firstState).TakeInitialMessages();
        Assert.IsTrue(again.OfType<SpecEvent>().Any(e => e.Path == SpecElements.JobOrderAdded && Id(e) == "90002/01"));
    }

    [TestMethod]
    public void ARouteThatIsNotEnabled_OrNamesAnotherMachine_ChangesNothing()
    {
        var off = WithRoute();
        off.Routes["Valve"] = new RouteConfig { Enabled = false, Steps = off.Routes["Valve"].Steps };
        var plain = Serialise(Run(Machine("A", MachineRun.Config(failureRate: 0)), TimeSpan.FromHours(1)));
        Assert.AreEqual(plain, Serialise(Run(Machine("A", off), TimeSpan.FromHours(1))));
        Assert.AreEqual(
            Serialise(Run(Machine("D", MachineRun.Config(failureRate: 0)), TimeSpan.FromHours(1))),
            Serialise(Run(Machine("D", WithRoute()), TimeSpan.FromHours(1))));
    }

    [TestMethod]
    public void ThreeMachines_PassOneJobOrderInTurn_UnderOneJobOrderId()
    {
        var config = WithRoute(interval: TimeSpan.FromMinutes(20));
        var machines = new[] { Machine("A", config), Machine("B", config), Machine("C", config) };
        var messages = machines.Select(m => new List<SpecMessage>(m.TakeInitialMessages())).ToArray();
        for (var now = MachineRun.Start.AddSeconds(1); now <= MachineRun.Start.AddHours(4); now = now.AddSeconds(1))
        {
            for (var i = 0; i < machines.Length; i++)
            {
                messages[i].AddRange(machines[i].Advance(now));
            }
            // What the broker hands on: the retained lists of the machine before.
            machines[1].ObserveUpstream(First, ListsOf(machines[0]));
            machines[2].ObserveUpstream(Second, ListsOf(machines[1]));
        }

        var ended = messages.Select(m => m.OfType<SpecEvent>().Where(e => e.Path == SpecElements.JobOrderEnded).Select(Id).ToHashSet()).ToArray();
        var throughAll = ended[0].Intersect(ended[1]).Intersect(ended[2]).Where(IsRoute).ToList();
        Assert.IsNotEmpty(throughAll, "at least one route job order ended on all three machines");

        foreach (var id in throughAll)
        {
            for (var i = 1; i < machines.Length; i++)
            {
                var endBefore = EventsOf(messages[i - 1], id).Single(e => e.Path == SpecElements.JobOrderEnded).Timestamp;
                var released = EventsOf(messages[i], id).Single(e => e.Path == SpecElements.JobOrderReleased).Timestamp;
                var started = EventsOf(messages[i], id).Single(e => e.Path == SpecElements.JobOrderStarted).Timestamp;
                Assert.IsGreaterThanOrEqualTo(endBefore, released, $"{id} is released on machine {i} once the step before ended");
                Assert.IsGreaterThanOrEqualTo(released, started);
                var goodBefore = EventsOf(messages[i - 1], id).Last(e => e.Path == SpecElements.JobOrderResultChanged).Value["GoodQuantity"]!.GetValue<double>();
                var planned = EventsOf(messages[i], id).Last(e => e.Path != SpecElements.JobOrderResultChanged).Value["RunsPlanned"]!.GetValue<long>();
                Assert.AreEqual((long)goodBefore, planned, $"{id} plans on machine {i} the good parts of the step before");
            }
        }
    }

    [TestMethod]
    public void FromLists_JoinsTheEntryAndItsResult()
    {
        var orders = JsonNode.Parse("""[{"JobOrderID":"90001/01","State":"Ended","WorkMasterID":"WM-R10","RunsPlanned":4},{"State":"Running"}]""");
        var results = JsonNode.Parse("""[{"JobOrderID":"90001/01","EndTime":"2026-11-17T06:30:00.000Z","GoodQuantity":3}]""");

        var list = UpstreamJobOrder.FromLists(orders, results);

        Assert.HasCount(1, list);
        Assert.AreEqual(new UpstreamJobOrder("90001/01", "Ended", "WM-R10", 4, 3, true), list[0]);
        Assert.IsFalse(UpstreamJobOrder.FromLists(orders, null)[0].ResultFinal);
        Assert.IsEmpty(UpstreamJobOrder.FromLists(null, results));
    }

    private static SpecOutputConfig WithRoute(TimeSpan? interval = null)
    {
        var config = MachineRun.Config(failureRate: 0);
        config.Routes["Valve"] = new RouteConfig
        {
            Enabled = true,
            Quantity = 4,
            Interval = interval ?? TimeSpan.FromMinutes(30),
            Steps =
            [
                new RouteStepConfig { MachineId = First, JobName = "Route turning", WorkMaster = "WM-R10", Program = "R10.MPF", CycleTime = TimeSpan.FromSeconds(30) },
                new RouteStepConfig { MachineId = Second, JobName = "Route milling", WorkMaster = "WM-R20", Program = "R20.MPF", CycleTime = TimeSpan.FromSeconds(40) },
                new RouteStepConfig { MachineId = Third, JobName = "Route grinding", WorkMaster = "WM-R30", Program = "R30.MPF", CycleTime = TimeSpan.FromSeconds(20) },
            ],
        };
        return config;
    }

    private static VirtualMachine Machine(string serial, SpecOutputConfig config, RouteState? state = null)
    {
        var identity = new MachineIdentity("Alcyone Machine Works", serial, $"https://www.alcyone-machines.example/GM-500/{serial}");
        return new VirtualMachine(identity, config, new MachineCounters(1000, 5000, 100), MachineRun.Start, state);
    }

    private static UpstreamJobOrder Upstream(string id, string state, double? good, bool final)
    {
        return new UpstreamJobOrder(id, state, "WM-R10", 4, good, final);
    }

    private static List<SpecMessage> Run(VirtualMachine machine, TimeSpan duration)
    {
        var messages = new List<SpecMessage>(machine.TakeInitialMessages());
        for (var now = MachineRun.Start.AddSeconds(1); now <= MachineRun.Start + duration; now = now.AddSeconds(1))
        {
            messages.AddRange(machine.Advance(now));
        }
        return messages;
    }

    private static IReadOnlyList<UpstreamJobOrder> ListsOf(VirtualMachine machine)
    {
        var values = machine.Values.ToDictionary(v => v.Path);
        return UpstreamJobOrder.FromLists(values[SpecElements.JobOrders].Value, values.GetValueOrDefault(SpecElements.JobOrderResults)?.Value);
    }

    private static List<SpecEvent> EventsOf(IEnumerable<SpecMessage> messages, string jobOrderId)
    {
        return [.. messages.OfType<SpecEvent>().Where(e => e.Path.StartsWith("JobMonitoring.", StringComparison.Ordinal) && Id(e) == jobOrderId)];
    }

    /// <summary>A job order of the route: its numbers begin at 90001, those of the own queue at 4711.</summary>
    private static bool IsRoute(string id) => int.Parse(id.Split('/')[0], System.Globalization.CultureInfo.InvariantCulture) >= 90001;

    private static string Id(SpecEvent specEvent) => Id(specEvent.Value);

    private static string Id(JsonNode node) => node["JobOrderID"]?.GetValue<string>() ?? string.Empty;

    private static string State(JsonNode node) => node["State"]?.GetValue<string>() ?? string.Empty;

    private static string Serialise(List<SpecMessage> messages)
    {
        return string.Join('\n', messages.Select(m => m switch
        {
            SpecValue v => $"{v.Timestamp:O} {v.Path} {v.Value?.ToJsonString()}",
            SpecEvent e => $"{e.Timestamp:O} {e.Path} {e.Value.ToJsonString()}",
            _ => string.Empty,
        }));
    }
}
