using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pleiades.Playground.Common.DataTransferObjects;

/// <summary>
/// JSON converter for <see cref="ComparisonOperator"/> that supports both
/// enum names ("GreaterThan") and legacy symbol notation ("&gt;", "&lt;", "&gt;=", "&lt;=", "==", "!=").
/// Always serializes as the enum name.
/// </summary>
public sealed class ComparisonOperatorJsonConverter : JsonConverter<ComparisonOperator>
{
    /// <inheritdoc />
    public override ComparisonOperator Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();

        return value switch
        {
            ">" or "GreaterThan" or "greaterThan" => ComparisonOperator.GreaterThan,
            "<" or "LessThan" or "lessThan" => ComparisonOperator.LessThan,
            ">=" or "GreaterThanOrEqual" or "greaterThanOrEqual" => ComparisonOperator.GreaterThanOrEqual,
            "<=" or "LessThanOrEqual" or "lessThanOrEqual" => ComparisonOperator.LessThanOrEqual,
            "==" or "Equal" or "equal" => ComparisonOperator.Equal,
            "!=" or "NotEqual" or "notEqual" => ComparisonOperator.NotEqual,
            _ => throw new JsonException($"Unknown comparison operator: '{value}'")
        };
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, ComparisonOperator value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString());
    }
}
