using System.Reflection;
using Pleiades.Playground.Mcp.Discovery;

namespace Pleiades.Playground.Mcp.Discovery.Test;

[TestClass]
public class EmbeddedResourceReaderTests
{
    [TestMethod]
    public void Read_ExistingResource_ReturnsContent()
    {
        var assembly = typeof(EmbeddedResourceReaderTests).GetTypeInfo().Assembly;
        var resourceName = $"{assembly.GetName().Name}.Resources.sample-skill.md";

        var content = EmbeddedResourceReader.Read(assembly, resourceName);

        StringAssert.Contains(content, "Sample Skill Guide", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Read_MissingResource_ThrowsWithAvailableResourceList()
    {
        var assembly = typeof(EmbeddedResourceReaderTests).GetTypeInfo().Assembly;

        var ex = Assert.ThrowsExactly<InvalidOperationException>(
            () => EmbeddedResourceReader.Read(assembly, "does.not.exist"));

        StringAssert.Contains(ex.Message, "does.not.exist", StringComparison.Ordinal);
        StringAssert.Contains(ex.Message, "Available resources", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Read_NullAssembly_Throws()
    {
        Assert.ThrowsExactly<ArgumentNullException>(() => EmbeddedResourceReader.Read(null!, "x"));
    }

    [TestMethod]
    public void Read_BlankResourceName_Throws()
    {
        var assembly = typeof(EmbeddedResourceReaderTests).GetTypeInfo().Assembly;
        Assert.ThrowsExactly<ArgumentException>(() => EmbeddedResourceReader.Read(assembly, "  "));
    }
}
