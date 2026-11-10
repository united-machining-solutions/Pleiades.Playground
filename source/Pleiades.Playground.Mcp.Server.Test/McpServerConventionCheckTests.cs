using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Server;
using Pleiades.Playground.Mcp.Discovery;
using DescriptionAttribute = System.ComponentModel.DescriptionAttribute;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>
/// The startup check logs one warning per deviation from the Pleiades conventions, keeps the same texts in
/// <see cref="McpServerConventionReport"/> for tests, and stays silent for a server that follows them.
/// </summary>
[TestClass]
public sealed class McpServerConventionCheckTests
{
    private const string Category = "Pleiades.Playground.Mcp.Server.McpServerConventionCheck";

    [TestMethod]
    public async Task StandardServer_LogsNoWarning()
    {
        using var logs = new LogCollector(Category);

        await using var host = await SampleHost.StartAsync(mapOpenApi: true, logs: logs);

        Assert.IsEmpty(logs.Warnings, string.Join(Environment.NewLine, logs.Warnings));
        Assert.IsEmpty(Report(host));
    }

    [TestMethod]
    public async Task DeviatingServer_LogsOneWarningPerDeviation_AndReportsTheSame()
    {
        using var logs = new LogCollector(Category);

        await using var host = await SampleHost.StartAsync(
            mapOpenApi: false,
            options => options.Domains.Add(new string('x', ServerInstructionsRenderer.RecommendedMaxLength)),
            tools: mcp => mcp.WithPleiadesTools<DeviatingTools>(),
            logs: logs);

        var warnings = logs.Warnings;
        Assert.HasCount(6, warnings, string.Join(Environment.NewLine, warnings));
        Assert.ContainsSingle(
            w => w.StartsWith("MCP server instructions are about ", StringComparison.Ordinal)
                && w.Contains($"clients truncate above {ServerInstructionsRenderer.RecommendedMaxLength}.", StringComparison.Ordinal),
            warnings);
        Assert.Contains("MCP tool 'other_items_query' does not start with the server prefix 'sample_'.", warnings);
        Assert.Contains(
            "MCP tool 'sample_items_count' does not declare ReadOnly; set ReadOnly = true for reads, or false plus Destructive/Idempotent for writes.",
            warnings);

        // Independent of the ReadOnly check: an undeclared tool may write, so it needs a guard as well.
        Assert.Contains(Unguarded("sample_items_count"), warnings);
        Assert.Contains(Unguarded("sample_items_delete"), warnings);
        Assert.Contains(
            "MCP tool 'sample_items_update' may write and carries a bare [Authorize], which admits any authenticated caller; name the write policy (and set WritePolicy).",
            warnings);
        CollectionAssert.AreEqual(warnings.ToList(), Report(host).ToList(), "The report carries exactly what was logged.");
    }

    [TestMethod]
    public async Task WritePolicySet_AToolGuardedByAnythingElse_IsReported()
    {
        using var logs = new LogCollector(Category);

        await using var host = await SampleHost.StartAsync(
            mapOpenApi: false,
            options => options.WritePolicy = "sample:write",
            tools: mcp => mcp.WithPleiadesTools<PolicyTools>(),
            logs: logs);

        CollectionAssert.AreEquivalent(
            [
                "MCP tool 'sample_items_archive' may write but is not guarded by the write policy 'sample:write' ('sample:read').",
                "MCP tool 'sample_items_reset' may write but is not guarded by the write policy 'sample:write' ([Authorize] without a policy).",
            ],
            logs.Warnings,
            StringComparer.Ordinal,
            string.Join(Environment.NewLine, logs.Warnings));
    }

    [TestMethod]
    public async Task SkillMappedTwice_IsReported()
    {
        using var logs = new LogCollector(Category);

        // A migrating service that keeps its own GET /skill next to MapPleiadesMcp.
        await using var host = await SampleHost.StartAsync(
            mapOpenApi: false,
            endpoints: app => app.MapGet("/skill", () => "the service's own guide"),
            logs: logs);

        Assert.AreEqual(
            "GET /skill is mapped 2 times, so every request to it answers 500 (AmbiguousMatchException). " +
            "MapPleiadesMcp serves the guide behind the MCP guard; delete the service's own MapGet(\"/skill\").",
            Assert.ContainsSingle(logs.Warnings));
    }

    [TestMethod]
    public async Task ToolsRegisteredWithTheSdkAlone_AreNamedOnePerTool()
    {
        using var logs = new LogCollector(Category);

        // The SDK's own registration serializes with its defaults, past the service's HTTP JSON options.
        await using var host = await SampleHost.StartAsync(mapOpenApi: false, tools: mcp => mcp.WithTools<SdkRegisteredTools>(), logs: logs);

        Assert.AreEqual(PastHttpOptions("sample_items_total"), Assert.ContainsSingle(logs.Warnings));
    }

    [TestMethod]
    public async Task LeftoverSdkRegistrationFirst_WinsAndIsNamed()
    {
        using var logs = new LogCollector(Category);

        // What the warning used to invite: keep WithToolsFromAssembly() and append the library call. The SDK keeps
        // the first tool per name, so the SDK copy is served.
        await using var host = await SampleHost.StartAsync(
            mapOpenApi: false,
            tools: mcp => mcp.WithTools<SdkRegisteredTools>().WithPleiadesTools<SdkRegisteredTools>(),
            logs: logs);

        CollectionAssert.AreEquivalent(new[] { Duplicate("sample_items_total"), PastHttpOptions("sample_items_total") }, logs.Warnings.ToList());
    }

    [TestMethod]
    public async Task LeftoverSdkRegistrationSecond_IsADuplicateOnly()
    {
        using var logs = new LogCollector(Category);

        await using var host = await SampleHost.StartAsync(
            mapOpenApi: false,
            tools: mcp => mcp.WithPleiadesTools<SdkRegisteredTools>().WithTools<SdkRegisteredTools>(),
            logs: logs);

        Assert.AreEqual(Duplicate("sample_items_total"), Assert.ContainsSingle(logs.Warnings));
    }

    private static IReadOnlyList<string> Report(SampleHost host) =>
        host.App.Services.GetRequiredService<McpServerConventionReport>().Deviations;

    private static string Unguarded(string tool) =>
        $"MCP tool '{tool}' may write (ReadOnly is not true) and carries no [Authorize]; it is reachable with the read permission that guards the endpoint.";

    private static string PastHttpOptions(string tool) =>
        $"MCP tool '{tool}' is registered past the service's HTTP JSON options, so it can serialize differently from REST; register the tools with WithPleiadesToolsFromAssembly().";

    private static string Duplicate(string tool) =>
        $"MCP tool '{tool}' is registered 2 times; the SDK serves the first registration and drops the others.";

    [McpServerToolType]
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Only a type argument for the tool registration; its tools are static.")]
    internal sealed class DeviatingTools
    {
        [McpServerTool(Name = "other_items_query", ReadOnly = true), Description("Wrong prefix.")]
        public static string Query() => "ok";

        [McpServerTool(Name = "sample_items_count"), Description("ReadOnly undeclared, no guard.")]
        public static string Count() => "ok";

        [McpServerTool(Name = "sample_items_delete", ReadOnly = false, Destructive = true), Description("A write tool without [Authorize].")]
        public static string Delete() => "ok";

        [McpServerTool(Name = "sample_items_update", ReadOnly = false, Destructive = false), Description("A write tool with a bare [Authorize].")]
        [Authorize]
        public static string Update() => "ok";

        [McpServerTool(Name = "sample_items_rename", ReadOnly = false, Destructive = false), Description("A write tool with a named policy: fine.")]
        [Authorize(Policy = "sample:write")]
        public static string Rename() => "ok";
    }

    [McpServerToolType]
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Only a type argument for the tool registration; its tools are static.")]
    internal sealed class PolicyTools
    {
        [McpServerTool(Name = "sample_items_rename", ReadOnly = false, Destructive = false), Description("Guarded by the write policy: fine.")]
        [Authorize(Policy = "sample:write")]
        public static string Rename() => "ok";

        [McpServerTool(Name = "sample_items_archive", ReadOnly = false, Destructive = false), Description("Guarded by the read policy.")]
        [Authorize(Policy = "sample:read")]
        public static string Archive() => "ok";

        [McpServerTool(Name = "sample_items_reset", ReadOnly = false, Destructive = true), Description("Bare [Authorize].")]
        [Authorize]
        public static string Reset() => "ok";

        [McpServerTool(Name = "sample_items_peek", ReadOnly = true), Description("A read needs no write guard.")]
        public static string Peek() => "ok";
    }

    [McpServerToolType]
    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Only a type argument for the tool registration; its tools are static.")]
    internal sealed class SdkRegisteredTools
    {
        [McpServerTool(Name = "sample_items_total", ReadOnly = true), Description("Registered with the SDK alone.")]
        public static int Total() => 42;
    }
}
