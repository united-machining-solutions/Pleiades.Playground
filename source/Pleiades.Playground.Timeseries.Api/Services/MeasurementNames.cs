namespace Pleiades.Playground.Timeseries.Api.Services;

internal static class MeasurementNames
{
    internal const string BaseUnitValues = "baseunitvalues";
    internal const string StringValues = "stringvalues";
    internal const string BooleanValues = "booleanvalues";

    /// <summary>
    /// Companion collection (regular, NOT time-series) that records which topic has data in
    /// which minute bucket. Keyed by <c>(type, topic, minute)</c> so range-accurate topic
    /// discovery becomes a tiny, index-covered scan instead of unpacking time-series buckets.
    /// </summary>
    internal const string TopicActivity = "topic_activity";
}
