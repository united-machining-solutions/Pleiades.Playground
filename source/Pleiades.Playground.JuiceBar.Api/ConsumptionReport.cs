using System.Globalization;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// How the ingredients on the pumps were used, computed here from the pumps of the machine and the report of the
/// marketplace, so that whoever shows it only words it: the counts, their order and the least used one.
/// </summary>
internal static class ConsumptionReport
{
    /// <summary>How many hours back the recent count looks if nobody asks for more or less, and at most.</summary>
    internal const int DefaultHours = 8;

    internal const int MostHours = 24;

    /// <summary>The start of "since the start", as the website of the marketplace has it: it sold nothing before.</summary>
    internal static readonly DateTimeOffset Start = new(2010, 1, 1, 0, 0, 0, TimeSpan.Zero);

    internal const string Source =
        "Sold drinks with each ingredient, from the public report of the marketplace (GET /api/reports/components/top), "
        + "over all machines of the marketplace: drinks, not millilitres. The pumps and their ingredients from the machine "
        + "(GET /api/admin/pumps), the colours from its list of ingredients (GET /api/components).";

    /// <summary>
    /// Each ingredient on a pump once, with the pumps it is on and its counts: in the report by its name; not in a
    /// report that has room left, in no drink; not in a full report, not known.
    /// </summary>
    internal static Consumption Of(IReadOnlyList<Pump> pumps, IReadOnlyDictionary<string, string> colors,
        IReadOnlyList<IngredientReport> sinceStart, IReadOnlyList<IngredientReport> inHours, int hours,
        DateTimeOffset from, DateTimeOffset to)
    {
        IngredientUse[] ingredients = [.. pumps
            .Where(p => !string.IsNullOrWhiteSpace(p.ComponentId))
            .GroupBy(p => p.ComponentId!, StringComparer.OrdinalIgnoreCase)
            .Select(pumpsOfOne =>
            {
                var name = pumpsOfOne.Select(p => p.ComponentName?.Trim()).FirstOrDefault(n => !string.IsNullOrEmpty(n));
                var warnings = pumpsOfOne.Select(p => p.AmountWarning).ToArray();
                bool? runsLow = warnings.Any(w => w == true) ? true : warnings.All(w => w == false) ? false : null;
                return new IngredientUse(pumpsOfOne.Key, name, colors.GetValueOrDefault(pumpsOfOne.Key),
                    [.. pumpsOfOne.Select(p => p.Number).Order()], DrinksIn(inHours, name), DrinksIn(sinceStart, name), runsLow);
            })
            .OrderByDescending(one => one.DrinksSinceStart ?? -1)
            .ThenByDescending(one => one.DrinksInHours ?? -1)
            .ThenBy(NameOf, StringComparer.OrdinalIgnoreCase)];

        // Only where every count since the start is known: one that is not may be the least used.
        var least = ingredients.Length == 0 || ingredients.Any(one => one.DrinksSinceStart is null)
            ? null
            : ingredients
                .OrderBy(one => one.DrinksSinceStart)
                .ThenBy(one => one.DrinksInHours ?? int.MaxValue)
                .ThenBy(NameOf, StringComparer.OrdinalIgnoreCase)
                .First();
        return new(from, to, hours, ingredients, least?.ComponentId, SummaryOf(ingredients, least, hours), Source);
    }

    private static int? DrinksIn(IReadOnlyList<IngredientReport> report, string? name)
    {
        if (name is null)
        {
            return null;
        }

        var line = report.FirstOrDefault(l => string.Equals(l.Name, name, StringComparison.OrdinalIgnoreCase));
        return line?.Drinks ?? (report.Count < MarketplaceClient.ReportLimit ? 0 : null);
    }

    private static string NameOf(IngredientUse one) => one.Name ?? one.ComponentId;

    private static string SummaryOf(IngredientUse[] ingredients, IngredientUse? least, int hours)
    {
        if (ingredients.Length == 0)
        {
            return "No ingredient is on a pump of the juice bar.";
        }

        var last = hours == 1 ? "the last hour" : string.Create(CultureInfo.InvariantCulture, $"the last {hours} h");
        var said = least is null
            ? "Which ingredient is used least is not known: one has no name, or is not among the ten the report of the marketplace names."
            : string.Create(CultureInfo.InvariantCulture,
                $"{NameOf(least)} is used least: in {least.DrinksSinceStart} sold drinks since the start, {Count(least.DrinksInHours)} in {last} ({PumpsOf(least)}).");
        var most = ingredients[0];
        if (most.DrinksSinceStart is { } drinks && !ReferenceEquals(most, least))
        {
            said += string.Create(CultureInfo.InvariantCulture, $" Used most: {NameOf(most)}, in {drinks}.");
        }

        return said + " The counts are sold drinks with the ingredient, over all machines of the marketplace, not millilitres.";
    }

    private static string Count(int? drinks) => drinks?.ToString(CultureInfo.InvariantCulture) ?? "an unknown number";

    private static string PumpsOf(IngredientUse one)
        => one.Pumps.Count == 1
            ? string.Create(CultureInfo.InvariantCulture, $"pump {one.Pumps[0]}")
            : "pumps " + string.Join(" and ", one.Pumps.Select(p => p.ToString(CultureInfo.InvariantCulture)));
}
