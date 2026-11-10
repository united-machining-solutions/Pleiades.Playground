using ModelContextProtocol;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.McpTools;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>The argument rules the Events MCP tools share.</summary>
[TestClass]
public sealed class EventToolArgumentsTests
{
    private enum Level
    {
        Information,
        Warning,
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("  ")]
    public void ABlankFilter_MeansNoFilter(string? value) =>
        Assert.IsNull(EventToolArguments.ParseEnum<Level>(value, "level"));

    [TestMethod]
    [DataRow("warning")]
    [DataRow("WARNING")]
    public void AKnownValue_IsParsedIgnoringCase(string value) =>
        Assert.AreEqual(Level.Warning, EventToolArguments.ParseEnum<Level>(value, "level"));

    [TestMethod]
    [DataRow("Severe")]
    [DataRow("99")]
    [DataRow("Information,Warning")]
    public void AnUnknownValue_IsRefusedWithTheAllowedValues(string value)
    {
        // "99" and the list matter: Enum.TryParse accepts numbers and ORs a comma list bitwise (here 0 | 1,
        // a defined value), so only a name match refuses them.
        var error = Assert.ThrowsExactly<McpException>(() => EventToolArguments.ParseEnum<Level>(value, "level"));

        Assert.AreEqual($"Invalid level '{value}'. Allowed values: Information, Warning.", error.Message);
    }

    [TestMethod]
    public void ACommaList_OfRealLevels_IsRefusedInsteadOfFilteringOnAnother()
    {
        // The reviewed case: "Warning,Error" parsed as Error and the tool answered a normal, differently filtered page.
        var error = Assert.ThrowsExactly<McpException>(() => EventToolArguments.ParseEnum<EventLevel>("Warning,Error", "level"));

        Assert.StartsWith("Invalid level 'Warning,Error'. Allowed values: ", error.Message, StringComparison.Ordinal);
    }

    [TestMethod]
    public void TheSortDirection_DefaultsToDescending_AndRefusesAnythingElse()
    {
        Assert.AreEqual(Sorting.Descending, EventToolArguments.ParseSorting(null));
        Assert.AreEqual(Sorting.Ascending, EventToolArguments.ParseSorting("ascending"));
        Assert.ThrowsExactly<McpException>(() => EventToolArguments.ParseSorting("Newest"));
    }

    [TestMethod]
    [DataRow(-5, 20, 0, 20)]
    [DataRow(10, 0, 10, 1)]
    [DataRow(0, 500, 0, 100)]
    public void ThePage_IsClampedToWhatIsActuallyQueried(int skip, int take, int expectedSkip, int expectedTake)
    {
        var (actualSkip, actualTake) = EventToolArguments.Page(skip, take);

        Assert.AreEqual(expectedSkip, actualSkip);
        Assert.AreEqual(expectedTake, actualTake);
    }
}
