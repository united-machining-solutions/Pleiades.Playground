// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>What the stack light shows from: the state of the virtual machine and its active alerts.</summary>
/// <param name="Off">The machine is off (<c>MachineryItemState = NotAvailable</c>).</param>
/// <param name="Executing">A program runs.</param>
/// <param name="Interrupted">The program is interrupted (NC stop, programmed halt, failure).</param>
/// <param name="Setup">The machine is set up (<c>MachineryOperationMode = Setup</c>).</param>
/// <param name="OperatorAsked">A job order ended or none is released: the machine waits for the operator.</param>
/// <param name="Failure">An alert of the category Failure is active.</param>
/// <param name="Warning">An alert of the category OffSpec or CheckFunction is active.</param>
/// <param name="Maintenance">An alert of the category MaintenanceRequired is active.</param>
internal sealed record StacklightInput(
    bool Off = false,
    bool Executing = false,
    bool Interrupted = false,
    bool Setup = false,
    bool OperatorAsked = false,
    bool Failure = false,
    bool Warning = false,
    bool Maintenance = false);

/// <summary>
/// Which lamp of the stack light shows what. The model prescribes no such mapping; this is an assumption of the
/// emulator, a usual one for machine tools. Several lamps may be on at once. A lamp follows the first rule that
/// applies to it, in the order of <see cref="Rules"/>: an alert comes before the state of the machine. Without a blue
/// lamp, what blue would show goes to yellow, as flashing (maintenance) or blinking (operator asked). The stack light
/// reports the mode, not each on and off of a blinking lamp.
/// </summary>
internal static class StacklightRules
{
    public const string Red = "Red";
    public const string Yellow = "Yellow";
    public const string Green = "Green";
    public const string Blue = "Blue";
    public const string Continuous = "Continuous";
    public const string Blinking = "Blinking";
    public const string Flashing = "Flashing";

    /// <summary>The lamps of a stack light of four, from <c>NumberInList</c> 0: red, yellow, green, blue.</summary>
    public static readonly IReadOnlyList<string> FourLamps = [Red, Yellow, Green, Blue];

    /// <summary>The rules, first match per lamp wins: (applies, lamp with blue, lamp without blue, mode without blue).</summary>
    private static readonly (Func<StacklightInput, bool> Applies, string Lamp, string Mode, string LampWithoutBlue, string ModeWithoutBlue)[] Rules =
    [
        (s => s.Failure, Red, Continuous, Red, Continuous),
        (s => s.Warning, Yellow, Blinking, Yellow, Blinking),
        (s => s.Maintenance, Blue, Continuous, Yellow, Flashing),
        (s => s.Interrupted, Green, Blinking, Green, Blinking),
        (s => s.Executing, Green, Continuous, Green, Continuous),
        (s => s.Setup, Yellow, Continuous, Yellow, Continuous),
        (s => s.OperatorAsked, Blue, Blinking, Yellow, Blinking),
    ];

    /// <summary>
    /// The value of <c>Stacklight.StackElement</c>: one entry per lamp, <c>NumberInList</c> from 0 in the order of
    /// <paramref name="lamps"/>, with <c>SignalOn</c>, its colour and its mode. A lamp that is off keeps its colour
    /// and says <c>Continuous</c>.
    /// </summary>
    public static JsonArray StackElements(IReadOnlyList<string> lamps, StacklightInput input)
    {
        ArgumentNullException.ThrowIfNull(lamps);
        ArgumentNullException.ThrowIfNull(input);
        var hasBlue = lamps.Contains(Blue);
        var modes = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!input.Off)
        {
            foreach (var rule in Rules.Where(r => r.Applies(input)))
            {
                var lamp = hasBlue ? rule.Lamp : rule.LampWithoutBlue;
                var mode = hasBlue ? rule.Mode : rule.ModeWithoutBlue;
                modes.TryAdd(lamp, mode);
            }
        }

        var elements = new JsonArray();
        for (var i = 0; i < lamps.Count; i++)
        {
            var on = modes.TryGetValue(lamps[i], out var mode);
            elements.Add(new JsonObject
            {
                ["NumberInList"] = i,
                ["SignalOn"] = on,
                ["SignalColor"] = lamps[i],
                ["SignalMode"] = on ? mode : Continuous,
            });
        }
        return elements;
    }
}
