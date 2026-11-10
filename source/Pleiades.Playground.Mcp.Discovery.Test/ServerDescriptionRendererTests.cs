using Pleiades.Playground.Mcp.Discovery;

namespace Pleiades.Playground.Mcp.Discovery.Test;

[TestClass]
public class ServerDescriptionRendererTests
{
    [TestMethod]
    public void Render_TitleOnly_OmitsAllOptionalSections()
    {
        var description = new ServerDescription(
            Title: "Knowledge Base MCP server.",
            Domains: [],
            DiscoveryFlow: [],
            Tools: []);

        var rendered = ServerDescriptionRenderer.Render(description);

        Assert.AreEqual("Knowledge Base MCP server.\n", rendered);
    }

    [TestMethod]
    public void Render_FullDescription_NumbersFlowAndBulletsOthers()
    {
        var description = new ServerDescription(
            Title: "Knowledge Base MCP server for machine-tool documentation.",
            Domains: ["PDFs", "Vector chunks"],
            DiscoveryFlow:
            [
                "Call kb_get_skill_guide.",
                "Call kb_search."
            ],
            Tools: ["kb_describe_server", "kb_search"]);

        var rendered = ServerDescriptionRenderer.Render(description);

        StringAssert.Contains(rendered, "Available domains:\n- PDFs\n- Vector chunks\n", StringComparison.Ordinal);
        StringAssert.Contains(rendered, "Recommended discovery flow:\n1. Call kb_get_skill_guide.\n2. Call kb_search.\n", StringComparison.Ordinal);
        StringAssert.Contains(rendered, "Available tools:\n- kb_describe_server\n- kb_search", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Render_BlankTitle_Throws()
    {
        var description = new ServerDescription(
            Title: "  ",
            Domains: [],
            DiscoveryFlow: [],
            Tools: []);

        Assert.ThrowsExactly<ArgumentException>(() => ServerDescriptionRenderer.Render(description));
    }

    [TestMethod]
    public void Render_NullDescription_Throws()
    {
        Assert.ThrowsExactly<ArgumentNullException>(() => ServerDescriptionRenderer.Render(null!));
    }
}
