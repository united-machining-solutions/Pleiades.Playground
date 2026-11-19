namespace Pleiades.Playground.JuiceBar.Api.Test;

[TestClass]
public sealed class ConsumptionReportTests
{
    private const string Cherry = "cherry-id";
    private const string Water = "water-id";
    private const string Apple = "apple-id";
    private static readonly DateTimeOffset To = new(2026, 11, 19, 18, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset From = To.AddHours(-8);
    private static readonly Dictionary<string, string> Colors = new() { [Cherry] = "#cc0000", [Water] = "#00bfff" };

    // Cherry on two pumps, one of which warns; apple on a pump whose warning is not known yet.
    private static readonly Pump[] Pumps =
    [
        new(1, Cherry, "Cherry Juice", 0.0015, false),
        new(2, Water, "Mineral Water", 0.0015, false),
        new(3, Apple, "Apple Juice", 0.0015, null),
        new(4, Cherry, "Cherry Juice", 0.001, true),
        new(5, null, null, 0.001, null),
    ];

    [TestMethod]
    public void EachIngredientOnAPumpStandsOnceTheMostUsedFirstAndTheLeastUsedIsNamed()
    {
        IngredientReport[] sinceStart = [new("Mineral Water", 15), new("cherry juice", 7), new("Apple Juice", 5), new("Rum", 30)];
        IngredientReport[] inHours = [new("Cherry Juice", 3), new("Apple Juice", 2)];

        var used = ConsumptionReport.Of(Pumps, Colors, sinceStart, inHours, 8, From, To);

        // Rum is on no pump of this machine, and an empty pump is no ingredient.
        Assert.AreEqual($"{Water} {Cherry} {Apple}", string.Join(' ', used.Ingredients.Select(i => i.ComponentId)));
        var cherry = used.Ingredients[1];
        Assert.AreEqual("1 4", string.Join(' ', cherry.Pumps));
        Assert.AreEqual(7, cherry.DrinksSinceStart);
        Assert.AreEqual(3, cherry.DrinksInHours);
        Assert.AreEqual("#cc0000", cherry.Color);
        Assert.IsTrue(cherry.RunsLow);
        // Water is not in the report of the last hours, which has room left: it was in no drink then.
        Assert.AreEqual(0, used.Ingredients[0].DrinksInHours);
        Assert.IsFalse(used.Ingredients[0].RunsLow);
        Assert.IsNull(used.Ingredients[2].RunsLow);
        Assert.IsNull(used.Ingredients[2].Color);

        Assert.AreEqual(Apple, used.LeastUsedId);
        Assert.AreEqual(
            "Apple Juice is used least: in 5 sold drinks since the start, 2 in the last 8 h (pump 3). Used most: Mineral Water, in 15. "
            + "The counts are sold drinks with the ingredient, over all machines of the marketplace, not millilitres.",
            used.Summary);
        Assert.AreEqual(From, used.From);
        Assert.AreEqual(To, used.To);
    }

    [TestMethod]
    public void AnIngredientMissingFromAFullReportIsNotKnownAndThenNoneIsCalledLeastUsed()
    {
        // Ten lines, apple not among them: it may have been in four drinks or in none.
        IngredientReport[] full = [.. Enumerable.Range(1, 9).Select(n => new IngredientReport($"Other {n}", 40 - n)),
            new("Cherry Juice", 7)];

        var used = ConsumptionReport.Of(Pumps, Colors, full, [], 1, To.AddHours(-1), To);

        var apple = used.Ingredients.Single(i => i.ComponentId == Apple);
        Assert.IsNull(apple.DrinksSinceStart);
        Assert.AreEqual(0, apple.DrinksInHours);
        // What is known stands first; water is missing from the full report too.
        Assert.AreEqual(Cherry, used.Ingredients[0].ComponentId);
        Assert.IsNull(used.Ingredients.Single(i => i.ComponentId == Water).DrinksSinceStart);
        Assert.IsNull(used.LeastUsedId);
        Assert.StartsWith("Which ingredient is used least is not known", used.Summary, StringComparison.Ordinal);
    }

    [TestMethod]
    public void ATieSinceTheStartIsDecidedByTheLastHours()
    {
        IngredientReport[] sinceStart = [new("Mineral Water", 5), new("Cherry Juice", 5), new("Apple Juice", 5)];
        IngredientReport[] inHours = [new("Mineral Water", 2), new("Cherry Juice", 1), new("Apple Juice", 3)];

        var used = ConsumptionReport.Of(Pumps, Colors, sinceStart, inHours, 8, From, To);

        Assert.AreEqual(Cherry, used.LeastUsedId);
        Assert.Contains("(pumps 1 and 4)", used.Summary, StringComparison.Ordinal);
    }

    [TestMethod]
    public void WithoutPumpsThereIsNothingToCount()
    {
        var used = ConsumptionReport.Of([], Colors, [], [], 8, From, To);

        Assert.IsEmpty(used.Ingredients);
        Assert.IsNull(used.LeastUsedId);
        Assert.AreEqual("No ingredient is on a pump of the juice bar.", used.Summary);
    }
}
