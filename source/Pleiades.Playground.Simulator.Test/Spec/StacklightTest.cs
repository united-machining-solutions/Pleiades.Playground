// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Test.Spec;

[TestClass]
public sealed class StacklightTest
{
    private static readonly string[] ThreeLamps = [StacklightRules.Red, StacklightRules.Yellow, StacklightRules.Green];

    /// <summary>What is on: colour and mode of each lamp that shines, in the order of the list.</summary>
    private static string On(JsonArray elements)
    {
        return string.Join(' ', elements.Select(e => e!.AsObject())
            .Where(e => e["SignalOn"]!.GetValue<bool>())
            .Select(e => $"{e["SignalColor"]}:{e["SignalMode"]}"));
    }

    [TestMethod]
    [DataRow("Executing", "Green:Continuous")]
    [DataRow("Interrupted", "Green:Blinking")]
    [DataRow("Setup", "Yellow:Continuous")]
    [DataRow("Warning", "Yellow:Blinking")]
    [DataRow("Failure", "Red:Continuous")]
    [DataRow("Maintenance", "Blue:Continuous")]
    [DataRow("OperatorAsked", "Blue:Blinking")]
    [DataRow("Off", "")]
    public void FourLamps_ShowEachStateAsTheTableSays(string state, string expected)
    {
        Assert.AreEqual(expected, On(StacklightRules.StackElements(StacklightRules.FourLamps, Input(state))));
    }

    [TestMethod]
    [DataRow("Maintenance", "Yellow:Flashing")]
    [DataRow("OperatorAsked", "Yellow:Blinking")]
    [DataRow("Executing", "Green:Continuous")]
    [DataRow("Failure", "Red:Continuous")]
    public void ThreeLamps_ShowWhatBlueWouldShow_OnYellow(string state, string expected)
    {
        var elements = StacklightRules.StackElements(ThreeLamps, Input(state));

        Assert.HasCount(3, elements);
        Assert.IsFalse(elements.Any(e => e!["SignalColor"]!.GetValue<string>() == StacklightRules.Blue), "no blue lamp");
        Assert.AreEqual(expected, On(elements));
    }

    [TestMethod]
    public void SeveralLampsMayShine_AndAnAlertComesBeforeTheState()
    {
        var failureWhileInterrupted = new StacklightInput(Interrupted: true, Failure: true, Maintenance: true);
        Assert.AreEqual("Red:Continuous Green:Blinking Blue:Continuous", On(StacklightRules.StackElements(StacklightRules.FourLamps, failureWhileInterrupted)));

        var warningDuringSetup = new StacklightInput(Setup: true, Warning: true);
        Assert.AreEqual("Yellow:Blinking", On(StacklightRules.StackElements(StacklightRules.FourLamps, warningDuringSetup)), "the alert wins the yellow lamp");

        var off = new StacklightInput(Off: true, Executing: true, Failure: true);
        Assert.AreEqual(string.Empty, On(StacklightRules.StackElements(StacklightRules.FourLamps, off)), "a machine that is off shows nothing");
    }

    [TestMethod]
    public void EveryElement_CarriesEveryField_NumberedFromZero()
    {
        var elements = StacklightRules.StackElements(StacklightRules.FourLamps, new StacklightInput(Executing: true));

        CollectionAssert.AreEqual(new[] { 0, 1, 2, 3 }, elements.Select(e => e!["NumberInList"]!.GetValue<int>()).ToList());
        CollectionAssert.AreEqual(StacklightRules.FourLamps.ToList(), elements.Select(e => e!["SignalColor"]!.GetValue<string>()).ToList());
        foreach (var element in elements.Select(e => e!.AsObject()))
        {
            CollectionAssert.AreEquivalent(new[] { "NumberInList", "SignalOn", "SignalColor", "SignalMode" }, element.Select(p => p.Key).ToList());
        }
    }

    [TestMethod]
    public void VirtualMachine_ShowsItsStateOnTheStacklight_AsAWholeListOnChange()
    {
        var run = MachineRun.For(TimeSpan.FromHours(6));

        Assert.AreEqual("Segmented", run.ValuesOf(SpecElements.StacklightMode).Single().Value!.GetValue<string>());
        var lists = run.ValuesOf(SpecElements.StackElement).ToList();
        Assert.IsTrue(lists.Count > 20, "it changes with the machine");
        Assert.IsTrue(lists.Zip(lists.Skip(1)).All(p => !JsonNode.DeepEquals(p.First.Value, p.Second.Value)), "sent only when a lamp changes");
        Assert.IsTrue(lists.All(l => l.Value!.AsArray().Count == 4), "always the whole list");
        Assert.IsFalse(run.Messages.OfType<SpecEvent>().Any(e => e.Path.StartsWith("Stacklight.", StringComparison.Ordinal)), "no events");

        // Green shines continuously exactly while a program runs and no failure stands.
        var status = run.ValuesOf(SpecElements.Status).ToList();
        foreach (var list in lists)
        {
            var itemState = status.Last(s => s.Timestamp <= list.Timestamp).Value!["MachineryItemState"]!.GetValue<string>();
            var green = list.Value!.AsArray().Single(e => e!["SignalColor"]!.GetValue<string>() == StacklightRules.Green)!;
            if (itemState == "Executing")
            {
                Assert.AreEqual("Continuous", green["SignalMode"]!.GetValue<string>(), $"at {list.Timestamp:O}");
                Assert.IsTrue(green["SignalOn"]!.GetValue<bool>());
            }
        }
        var modes = lists.SelectMany(l => l.Value!.AsArray()).Where(e => e!["SignalOn"]!.GetValue<bool>())
            .Select(e => $"{e!["SignalColor"]}:{e["SignalMode"]}").ToHashSet();
        CollectionAssert.IsSubsetOf(new[] { "Green:Continuous", "Green:Blinking", "Yellow:Continuous", "Red:Continuous", "Blue:Blinking" }, modes.ToList());
    }

    private static StacklightInput Input(string state) => state switch
    {
        "Executing" => new StacklightInput(Executing: true),
        "Interrupted" => new StacklightInput(Interrupted: true),
        "Setup" => new StacklightInput(Setup: true),
        "Warning" => new StacklightInput(Warning: true),
        "Failure" => new StacklightInput(Failure: true),
        "Maintenance" => new StacklightInput(Maintenance: true),
        "OperatorAsked" => new StacklightInput(OperatorAsked: true),
        "Off" => new StacklightInput(Off: true, Executing: true),
        _ => throw new ArgumentOutOfRangeException(nameof(state)),
    };
}
