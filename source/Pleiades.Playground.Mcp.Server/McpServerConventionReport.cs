using System.Collections.Concurrent;

namespace Pleiades.Playground.Mcp.Server;

/// <summary>
/// The deviations from the Pleiades conventions that the startup check found, the same texts it logs as
/// warnings. Resolve it from the started host to make them fail a test:
/// <c>factory.Services.GetRequiredService&lt;McpServerConventionReport&gt;().Deviations</c>.
/// </summary>
/// <remarks>
/// The check only warns at runtime, so an existing server keeps starting while it converges; the report is
/// how a server's own test suite turns the same findings into a gate.
/// </remarks>
public sealed class McpServerConventionReport
{
    private readonly ConcurrentQueue<string> _deviations = new();

    /// <summary>Every deviation found at startup, in the order the check found them.</summary>
    public IReadOnlyList<string> Deviations => [.. _deviations];

    internal void Add(string deviation) => _deviations.Enqueue(deviation);
}
