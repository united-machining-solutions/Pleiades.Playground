using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Events.Api.Endpoints;

namespace Pleiades.Playground.Events.Api.Test.McpTests;

/// <summary>
/// Pins the authorization form of every MCP tool. <c>/mcp</c> sits behind ONE read policy, so a
/// tool that may write is reachable with read permission unless it carries a guard of its own. Every
/// <c>[McpServerTool]</c> of the API is therefore either declared <c>ReadOnly = true</c> or carries
/// <c>[Authorize(Policy = "events:write")]</c>. A tool that does not declare <c>ReadOnly</c> at all is a
/// violation too: the attribute then reads <c>false</c>, and nobody decided it.
/// </summary>
/// <remarks>
/// The library's startup check reports the same, but only as a log line; <see cref="McpServerConformanceTests"/>
/// makes its report a gate on the running host, this test on the code as written.
/// </remarks>
[TestClass]
public sealed class McpToolContractTests
{
    private static readonly string WritePolicy = FeaturePolicy.Write(EventsFeature.Name);

    [TestMethod]
    public void EveryMcpServerTool_IsDeclaredReadOnly_OrGuardedByTheWritePolicy()
    {
        var tools = typeof(Program).Assembly
            .GetTypes()
            .Where(type => type.GetCustomAttribute<McpServerToolTypeAttribute>() is not null)
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            .Where(method => method.GetCustomAttribute<McpServerToolAttribute>() is not null)
            .ToList();

        Assert.IsNotEmpty(tools, "no [McpServerTool] methods found - the reflection sweep is broken, not the tool set clean");

        var violations = tools.Select(Violation).OfType<string>().ToList();

        Assert.IsEmpty(violations, string.Join(Environment.NewLine, violations));
    }

    private static string? Violation(MethodInfo method)
    {
        var name = $"{method.DeclaringType?.Name}.{method.Name}";

        // Read from the attribute data, not from the property: ReadOnly reads false when it was never set.
        var readOnly = method.GetCustomAttributesData()
            .Single(data => data.AttributeType == typeof(McpServerToolAttribute))
            .NamedArguments
            .Where(argument => argument.MemberName == nameof(McpServerToolAttribute.ReadOnly))
            .Select(argument => (bool?)argument.TypedValue.Value)
            .SingleOrDefault();

        if (readOnly is null)
        {
            return $"{name} does not declare ReadOnly; set ReadOnly = true for a read, or ReadOnly = false plus [Authorize(Policy = \"{WritePolicy}\")] for a write.";
        }

        var guards = method.GetCustomAttributes(inherit: true)
            .Concat(method.DeclaringType?.GetCustomAttributes(inherit: true) ?? [])
            .OfType<IAuthorizeData>();

        return readOnly is true || guards.Any(guard => guard.Policy == WritePolicy)
            ? null
            : $"{name} may write (ReadOnly = false) but carries no [Authorize(Policy = \"{WritePolicy}\")], so the read policy on /mcp is all that guards it.";
    }
}
