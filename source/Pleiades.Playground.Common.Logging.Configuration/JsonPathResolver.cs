using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Resolves type-safe lambda expressions to JSON paths,
/// respecting JsonPropertyName attributes and PropertyNamingPolicy.
/// </summary>
/// <remarks>
/// <para>
/// <b>CRITICAL IMPROVEMENT over naive member-chain extraction:</b>
/// This implementation handles array indexers like <c>c => c.Sinks[0].Password</c>
/// by converting any numeric index to the wildcard <c>[*]</c>.
/// </para>
/// <para>
/// Supports:
/// <list type="bullet">
/// <item>Simple properties: <c>c => c.Loki.ApiToken</c> → <c>"loki.apiToken"</c></item>
/// <item>Array indexers: <c>c => c.Sinks[0].Name</c> → <c>"sinks[*].name"</c></item>
/// <item>Nested paths: <c>c => c.Loki.Sinks[1].BasicAuth.Password</c> → <c>"loki.sinks[*].basicAuth.password"</c></item>
/// </list>
/// </para>
/// </remarks>
/// <typeparam name="TConfig">The configuration type</typeparam>
internal sealed class JsonPathResolver<TConfig>
{
    private readonly JsonSerializerOptions _options;

    public JsonPathResolver(JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
    }

    /// <summary>
    /// Resolves a simple property selector to a JSON path.
    /// </summary>
    /// <remarks>
    /// Supports array indexers: <c>c => c.Sinks[0].Name</c> → <c>"sinks[*].name"</c>
    /// </remarks>
    public string ResolvePath<TValue>(Expression<Func<TConfig, TValue>> selector)
    {
        ArgumentNullException.ThrowIfNull(selector);

        var segments = ExtractPathSegments(selector);
        if (segments.Count == 0)
        {
            throw new InvalidOperationException($"Selector '{selector}' does not contain any properties.");
        }

        return BuildJsonPath(segments);
    }

    /// <summary>
    /// Resolves a collection item property selector to a JSON path with wildcard.
    /// Example: ResolvePath(c => c.Sinks, s => s.Password) → "sinks[*].password"
    /// </summary>
    public string ResolveCollectionPath<TItem, TValue>(
        Expression<Func<TConfig, IEnumerable<TItem>>> collectionSelector,
        Expression<Func<TItem, TValue>> itemSelector)
    {
        ArgumentNullException.ThrowIfNull(collectionSelector);
        ArgumentNullException.ThrowIfNull(itemSelector);

        var collectionSegments = ExtractPathSegments(collectionSelector);
        if (collectionSegments.Count == 0)
        {
            throw new InvalidOperationException($"Collection selector '{collectionSelector}' must point to a property.");
        }

        var itemSegments = ExtractPathSegments(itemSelector);
        if (itemSegments.Count == 0)
        {
            throw new InvalidOperationException($"Item selector '{itemSelector}' must point to a property.");
        }

        // Ensure last segment of collection path has wildcard
        var lastCollectionSegment = collectionSegments[^1];
        if (!lastCollectionSegment.IsWildcard)
        {
            collectionSegments[^1] = lastCollectionSegment with { IsWildcard = true };
        }

        var allSegments = collectionSegments.Concat(itemSegments).ToList();
        return BuildJsonPath(allSegments);
    }

    private List<PathSegment> ExtractPathSegments(LambdaExpression lambda)
    {
        var segments = new List<PathSegment>();
        Expression? current = lambda.Body;

        while (current != null)
        {
            current = RemoveConvert(current);

            switch (current)
            {
                case MemberExpression memberExpr:
                    if (memberExpr.Member is PropertyInfo property)
                    {
                        segments.Add(new PathSegment(property, IsWildcard: false));
                    }
                    current = memberExpr.Expression;
                    break;

                case MethodCallExpression { Method.Name: "get_Item" } indexer:
                    // CRITICAL: Handle array/list indexers like Sinks[0]
                    // Convert ANY numeric index to wildcard [*]
                    if (indexer.Object is MemberExpression objMember &&
                        objMember.Member is PropertyInfo arrayProperty)
                    {
                        segments.Add(new PathSegment(arrayProperty, IsWildcard: true));
                        current = objMember.Expression;
                    }
                    else
                    {
                        throw new NotSupportedException(
                            $"Indexer expression '{indexer}' is not supported. " +
                            "Only property-based indexers like 'x.Collection[0]' are allowed.");
                    }
                    break;

                case ParameterExpression:
                    // Reached lambda parameter - stop traversal
                    current = null;
                    break;

                default:
                    throw new NotSupportedException(
                        $"Expression '{lambda}' contains unsupported node type '{current.NodeType}'. " +
                        "Only simple property access and array indexers are allowed.");
            }
        }

        segments.Reverse();
        return segments;
    }

    private static Expression RemoveConvert(Expression expression)
    {
        while (expression.NodeType is ExpressionType.Convert or ExpressionType.ConvertChecked)
        {
            expression = ((UnaryExpression)expression).Operand;
        }

        return expression;
    }

    private string BuildJsonPath(IReadOnlyList<PathSegment> segments)
    {
        var parts = segments.Select(seg =>
        {
            var jsonName = GetJsonPropertyName(seg.Property);

            return seg.IsWildcard
                ? $"{jsonName}[*]"
                : jsonName;
        });

        return string.Join('.', parts);
    }

    private string GetJsonPropertyName(PropertyInfo property)
    {
        // 1. Check for [JsonPropertyName] attribute
        var attr = property.GetCustomAttribute<JsonPropertyNameAttribute>();
        var name = attr?.Name ?? property.Name;

        // 2. Apply PropertyNamingPolicy (e.g., camelCase)
        if (_options.PropertyNamingPolicy is { } policy)
        {
            name = policy.ConvertName(name);
        }

        return name;
    }

    private sealed record PathSegment(PropertyInfo Property, bool IsWildcard);
}
