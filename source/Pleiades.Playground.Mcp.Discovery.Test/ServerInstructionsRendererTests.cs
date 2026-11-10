using Pleiades.Playground.Mcp.Discovery;

namespace Pleiades.Playground.Mcp.Discovery.Test;

[TestClass]
public class ServerInstructionsRendererTests
{
    private static readonly ServerDescription Uptime = new(
        Title: "Uptime API MCP server for machine state and uptime analysis on Pleiades industrial machines.",
        Domains:
        [
            "Machine states: Productive, Breakdown, Ready, Unknown",
            "Uptime profiles: an expression-based productive signal plus breakdown-level and event-suppression configuration",
            "Uptime query surface: summary aggregates, state intervals, and sampled state series over a time range",
        ],
        DiscoveryFlow:
        [
            "Use uptime_profiles_list to pick a profile, then the uptime_query_* tools to analyze a machine.",
        ],
        Tools: ["uptime_query_summary"]);

    private static readonly RestApiReference Rest =
        new(new Uri("https://gateway.example.com/uptime-api/openapi/v1.json"));

    [TestMethod]
    public void Render_WithRestApi_PutsTheEssentialsFirst()
    {
        var rendered = ServerInstructionsRenderer.Render(Uptime, "uptime", Rest);

        var essentials = rendered[..ServerInstructionsRenderer.EssentialsLength];
        StringAssert.StartsWith(rendered, Uptime.Title, StringComparison.Ordinal);
        StringAssert.Contains(essentials, "uptime_get_skill_guide", StringComparison.Ordinal);
        StringAssert.Contains(essentials, "https://gateway.example.com/uptime-api/openapi/v1.json", StringComparison.Ordinal);
        Assert.IsLessThan(ServerInstructionsRenderer.RecommendedMaxLength, rendered.Length);
    }

    [TestMethod]
    public void Render_GuidePointerIsConditional_AndTheRestLineAnOffer_BothInsideTheEssentials()
    {
        // Some hosts already paste the guide into the context, and
        // the REST line offers a second way without making it the default.
        var rendered = ServerInstructionsRenderer.Render(Uptime, "uptime", Rest);
        var restLineEnd = rendered.IndexOf('\n', rendered.IndexOf("REST API:", StringComparison.Ordinal));

        Assert.Contains("Full guide: if it is not already in your context, call uptime_get_skill_guide or read the resource uptime://skill.", rendered, StringComparison.Ordinal);
        Assert.Contains("you may use it for bulk reads and operations no tool offers; the tools stay the default.", rendered, StringComparison.Ordinal);
        Assert.DoesNotContain("prefer", rendered, StringComparison.OrdinalIgnoreCase);
        Assert.IsLessThanOrEqualTo(ServerInstructionsRenderer.EssentialsLength, restLineEnd, $"The REST line ends at {restLineEnd}.");
    }

    [TestMethod]
    public void Render_WithoutRestApi_OmitsTheRestLine()
    {
        var rendered = ServerInstructionsRenderer.Render(Uptime, "uptime", restApi: null);

        Assert.IsFalse(rendered.Contains("REST API", StringComparison.Ordinal));
        StringAssert.Contains(rendered, "uptime://skill", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Render_DoesNotRepeatTheToolList()
    {
        var rendered = ServerInstructionsRenderer.Render(Uptime, "uptime", Rest);

        Assert.IsFalse(rendered.Contains("uptime_query_summary", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Render_NumbersTheDiscoveryFlowAndBulletsTheDomains()
    {
        var rendered = ServerInstructionsRenderer.Render(Uptime, "uptime", restApi: null);

        StringAssert.Contains(rendered, "\nAvailable domains:\n- Machine states: Productive, Breakdown, Ready, Unknown\n", StringComparison.Ordinal);
        StringAssert.Contains(rendered, "\nRecommended discovery flow:\n1. Use uptime_profiles_list", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Render_BlankTitle_Throws()
    {
        var description = new ServerDescription("  ", [], [], []);

        Assert.ThrowsExactly<ArgumentException>(() => ServerInstructionsRenderer.Render(description, "uptime", null));
    }

    [TestMethod]
    public void Render_BlankPrefix_Throws()
    {
        Assert.ThrowsExactly<ArgumentException>(() => ServerInstructionsRenderer.Render(Uptime, " ", null));
    }
}
