using System.Reflection;

namespace Pleiades.Playground.Mcp.Discovery;

/// <summary>
/// Loads embedded text resources (typically <c>skill.md</c> guides) from an MCP
/// server assembly with consistent error messages.
/// </summary>
/// <remarks>
/// Centralising the helper here, instead of one copy per MCP server, lets
/// <c>DiscoveryTools.cs</c> in each consumer remain a trivial server-specific wrapper.
/// </remarks>
public static class EmbeddedResourceReader
{
    /// <summary>
    /// Reads an embedded resource as a UTF-8 string. The full <paramref name="resourceName"/>
    /// is required (typically <c>{AssemblyName}.Resources.skill.md</c>).
    /// </summary>
    /// <exception cref="ArgumentNullException">Thrown when an argument is null.</exception>
    /// <exception cref="InvalidOperationException">
    /// Thrown when the resource is not found in <paramref name="assembly"/>. The exception
    /// message lists all resources actually present, which is the single most helpful piece
    /// of information when this fails in CI.
    /// </exception>
    public static string Read(Assembly assembly, string resourceName)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        ArgumentException.ThrowIfNullOrWhiteSpace(resourceName);

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            var available = string.Join(", ", assembly.GetManifestResourceNames());
            throw new InvalidOperationException(
                $"Embedded resource '{resourceName}' not found in assembly '{assembly.GetName().Name}'. " +
                $"Available resources: [{available}].");
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
