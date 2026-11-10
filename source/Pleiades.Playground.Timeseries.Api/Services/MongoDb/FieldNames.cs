namespace Pleiades.Playground.Timeseries.Api.Services.MongoDb;

/// <summary>
/// BSON field names used by every Time-Series-Collection. Centralised so that index
/// creation, write paths and aggregation pipelines all agree on the schema.
/// </summary>
internal static class FieldNames
{
    /// <summary>Time field of every document (matches <c>timeField</c> in the collection).</summary>
    internal const string Timestamp = "ts";

    /// <summary>Metadata sub-document (matches <c>metaField</c> in the collection).</summary>
    internal const string Meta = "meta";

    /// <summary>Topic key inside <see cref="Meta"/>.</summary>
    internal const string Topic = "topic";

    /// <summary>Unit key inside <see cref="Meta"/> (only for base-unit values).</summary>
    internal const string Unit = "unit";

    /// <summary>Measurement value field at document root.</summary>
    internal const string Value = "value";

    /// <summary>Dotted path used in filters (<c>meta.topic</c>).</summary>
    internal const string MetaTopic = Meta + "." + Topic;

    /// <summary>Dotted path used in filters (<c>meta.unit</c>).</summary>
    internal const string MetaUnit = Meta + "." + Unit;

    /// <summary>Value-type discriminator in the <c>topic_activity</c> companion collection.</summary>
    internal const string Type = "type";

    /// <summary>Minute-floored timestamp in the <c>topic_activity</c> companion collection.</summary>
    internal const string Bucket = "bucket";
}

/// <summary>
/// Value-type discriminators stored in the <c>topic_activity</c> companion collection so the
/// three <c>TopicsDto</c> lists can be reconstructed from a single collection.
/// </summary>
internal static class TopicActivityTypes
{
    internal const string BaseUnit = "baseunit";
    internal const string String = "string";
    internal const string Boolean = "boolean";
}
