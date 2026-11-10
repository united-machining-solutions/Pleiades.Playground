using System.Collections.Immutable;
using System.Linq.Expressions;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Builds and applies redaction rules for configuration objects.
/// Produces redacted JSON representations safe for logging.
/// </summary>
/// <remarks>
/// <para>
/// <b>Thread-Safety:</b> This class is fully immutable and thread-safe.
/// All mutation operations return a new instance with the updated rules.
/// </para>
/// <para>
/// <b>PropertyNamingPolicy Support:</b> Fully respects JsonSerializerOptions.PropertyNamingPolicy.
/// If you use camelCase serialization, paths will be correctly resolved.
/// </para>
/// <para>
/// <b>Usage Example:</b>
/// <code>
/// var redactor = new ConfigurationRedactor&lt;MyConfig&gt;()
///     .Redact(c => c.ApiToken, BuiltInRedactors.MaskAll)
///     .RedactEach(c => c.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll)
///     .RedactEach(c => c.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskPartial);
///     
/// var redactedJson = redactor.SerializeAndRedact(myConfig);
/// logger.LogInformation("Config: {Config}", redactedJson);
/// </code>
/// </para>
/// </remarks>
/// <typeparam name="TConfig">The configuration type to redact</typeparam>
public sealed partial class ConfigurationRedactor<TConfig>
{
    private readonly JsonSerializerOptions _options;
    private readonly ImmutableArray<JsonPathRule> _rules;
    private readonly JsonPathResolver<TConfig> _resolver;

    /// <summary>
    /// Creates a new redactor with default JSON options (Web defaults = camelCase).
    /// </summary>
    public ConfigurationRedactor()
        : this(new JsonSerializerOptions(JsonSerializerDefaults.Web))
    {
    }

    /// <summary>
    /// Creates a new redactor with custom JSON serialization options.
    /// </summary>
    /// <param name="options">JSON serialization options. Must not be null.</param>
    /// <exception cref="ArgumentNullException">If options is null</exception>
    public ConfigurationRedactor(JsonSerializerOptions options)
        : this(options, [])
    {
    }

    private ConfigurationRedactor(JsonSerializerOptions options, ImmutableArray<JsonPathRule> rules)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
        _rules = rules;
        _resolver = new JsonPathResolver<TConfig>(_options);
    }

    /// <summary>
    /// Adds a redaction rule for a string property.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Supports array indexers - any numeric index is converted to wildcard:
    /// <c>c => c.Sinks[0].Password</c> → <c>"sinks[*].password"</c>
    /// </para>
    /// <para>
    /// This instance remains unchanged. A new instance with the additional rule is returned.
    /// </para>
    /// </remarks>
    /// <param name="propertySelector">Lambda selecting the property to redact</param>
    /// <param name="redactor">The redactor to apply</param>
    /// <returns>A new ConfigurationRedactor with the rule added</returns>
    /// <exception cref="ArgumentNullException">If any argument is null</exception>
    public ConfigurationRedactor<TConfig> Redact(
        Expression<Func<TConfig, string?>> propertySelector,
        IStringRedactor redactor)
    {
        ArgumentNullException.ThrowIfNull(propertySelector);
        ArgumentNullException.ThrowIfNull(redactor);

        var path = _resolver.ResolvePath(propertySelector);
        return AddRule(path, redactor);
    }

    /// <summary>
    /// Adds a redaction rule for a property within each item of a collection.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Example: <c>RedactEach(c => c.Sinks, s => s.Password, BuiltInRedactors.MaskAll)</c>
    /// produces the path <c>"sinks[*].password"</c>.
    /// </para>
    /// </remarks>
    /// <typeparam name="TItem">The collection item type</typeparam>
    /// <param name="collectionSelector">Lambda selecting the collection</param>
    /// <param name="itemPropertySelector">Lambda selecting the property within each item</param>
    /// <param name="redactor">The redactor to apply</param>
    /// <returns>A new ConfigurationRedactor with the rule added</returns>
    public ConfigurationRedactor<TConfig> RedactEach<TItem>(
        Expression<Func<TConfig, IEnumerable<TItem>>> collectionSelector,
        Expression<Func<TItem, string?>> itemPropertySelector,
        IStringRedactor redactor)
    {
        ArgumentNullException.ThrowIfNull(collectionSelector);
        ArgumentNullException.ThrowIfNull(itemPropertySelector);
        ArgumentNullException.ThrowIfNull(redactor);

        var path = _resolver.ResolveCollectionPath(collectionSelector, itemPropertySelector);
        return AddRule(path, redactor);
    }

    /// <summary>
    /// Adds a redaction rule for an explicit JSON path string.
    /// </summary>
    /// <remarks>
    /// Use this when you need to specify paths that can't be expressed with lambdas,
    /// or when working with dynamic configuration structures.
    /// </remarks>
    /// <param name="jsonPath">The JSON path (e.g., "sinks[*].basicAuth.password")</param>
    /// <param name="redactor">The redactor to apply</param>
    /// <returns>A new ConfigurationRedactor with the rule added</returns>
    public ConfigurationRedactor<TConfig> RedactPath(string jsonPath, IStringRedactor redactor)
    {
        if (string.IsNullOrWhiteSpace(jsonPath))
        {
            throw new ArgumentException("Path must not be null or empty.", nameof(jsonPath));
        }
        ArgumentNullException.ThrowIfNull(redactor);

        return AddRule(jsonPath, redactor);
    }

    /// <summary>
    /// Serializes the configuration to JSON and applies all redaction rules.
    /// </summary>
    /// <param name="config">The configuration to serialize and redact</param>
    /// <returns>A redacted JSON string safe for logging (pretty-printed)</returns>
    /// <exception cref="ArgumentNullException">If config is null</exception>
    public string SerializeAndRedact(TConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);

        var node = CreateRedactedJsonNode(config);
        var prettyOptions = new JsonSerializerOptions(_options)
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };
        return node.ToJsonString(prettyOptions);
    }

    /// <summary>
    /// Creates a redacted JsonNode tree from the configuration.
    /// Useful for structured logging where you want to pass the object directly.
    /// </summary>
    /// <param name="config">The configuration to redact</param>
    /// <returns>A JsonNode with redacted sensitive values</returns>
    public JsonNode CreateRedactedJsonNode(TConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);

        var json = JsonSerializer.Serialize(config, _options);
        var root = JsonNode.Parse(json) ?? new JsonObject();

        foreach (var rule in _rules)
        {
            ApplyRule(root, rule);
        }

        return root;
    }

    private ConfigurationRedactor<TConfig> AddRule(string jsonPath, IStringRedactor redactor)
    {
        var newRules = _rules.Add(new JsonPathRule(jsonPath, redactor));
        return new ConfigurationRedactor<TConfig>(_options, newRules);
    }

    [GeneratedRegex(@"\[(\d+|\*)\]$", RegexOptions.CultureInvariant)]
    private static partial Regex ArrayIndexRegex();

    private sealed record PathSegment(string PropertyName, bool IsWildcard);

    private static List<PathSegment> ParsePath(string path)
    {
        var parts = path.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var segments = new List<PathSegment>(parts.Length);

        foreach (var part in parts)
        {
            var name = part;
            var isWildcard = false;

            // Check for array notation: "sinks[*]" or "sinks[0]"
            var match = ArrayIndexRegex().Match(part);
            if (match.Success)
            {
                name = part[..match.Index];
                isWildcard = true; // Both [*] and [0] become wildcard
            }

            if (string.IsNullOrWhiteSpace(name))
            {
                throw new FormatException($"Invalid JSON path segment '{part}' in '{path}'.");
            }

            segments.Add(new PathSegment(name, isWildcard));
        }

        return segments;
    }

    private static void ApplyRule(JsonNode root, JsonPathRule rule)
    {
        var segments = ParsePath(rule.Path);
        ApplyRuleToNode(root, segments, 0, rule.Redactor);
    }

    private static void ApplyRuleToNode(
        JsonNode? node,
        IReadOnlyList<PathSegment> segments,
        int index,
        IStringRedactor redactor)
    {
        if (node is null)
        {
            return;
        }
        var segment = segments[index];
        var isLast = index == segments.Count - 1;

        if (node is not JsonObject obj)
        {
            // We only support paths through objects
            return;
        }

        if (!obj.TryGetPropertyValue(segment.PropertyName, out var child))
        {
            // Path doesn't exist - nothing to redact
            return;
        }

        if (!segment.IsWildcard)
        {
            if (isLast)
            {
                RedactNodeValue(obj, segment.PropertyName, child, redactor);
            }
            else
            {
                ApplyRuleToNode(child, segments, index + 1, redactor);
            }
            return;
        }

        // Wildcard: property must be an array
        if (child is not JsonArray array)
        {
            return;
        }

        if (isLast)
        {
            // Path like "items[*]" - redact array elements themselves
            for (var i = 0; i < array.Count; i++)
            {
                var element = array[i];
                if (element is JsonValue value)
                {
                    var redacted = RedactStringValue(value, redactor);
                    array[i] = redacted is null ? null : JsonValue.Create(redacted);
                }
            }
        }
        else
        {
            // Path like "sinks[*].password" - descend into each array element
            foreach (var element in array)
            {
                ApplyRuleToNode(element, segments, index + 1, redactor);
            }
        }
    }

    private static void RedactNodeValue(
        JsonObject parent,
        string propertyName,
        JsonNode? child,
        IStringRedactor redactor)
    {
        if (child is JsonValue value)
        {
            var redacted = RedactStringValue(value, redactor);
            parent[propertyName] = redacted is null ? null : JsonValue.Create(redacted);
        }
        else if (child is JsonArray array)
        {
            // Path ends on a collection directly: "passwords"
            for (var i = 0; i < array.Count; i++)
            {
                var element = array[i];
                if (element is JsonValue elementValue)
                {
                    var redacted = RedactStringValue(elementValue, redactor);
                    array[i] = redacted is null ? null : JsonValue.Create(redacted);
                }
            }
        }
        // For objects without further segments, do nothing
    }

    private static string? RedactStringValue(JsonValue value, IStringRedactor redactor)
    {
        try
        {
            var current = value.GetValue<string?>();
            return redactor.Redact(current);
        }
        catch
        {
            // Non-string value - leave untouched
            return null;
        }
    }
}
