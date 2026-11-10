using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Services;

/// <summary>
/// Maps the service-layer per-topic series dictionaries into the public response envelopes. Shared by
/// the REST endpoints and the MCP tools so the projection (including the epoch-microsecond timestamp
/// conversion) lives in exactly one place.
/// </summary>
internal static class SeriesResponseMapper
{
    /// <summary>Maps base unit series keyed by topic into a <see cref="BaseUnitSeriesResponseDto"/>.</summary>
    internal static BaseUnitSeriesResponseDto ToBaseUnitSeriesResponse(Dictionary<string, BaseUnitSeriesRequestDto> records) =>
        new()
        {
            Series = records.Select(entry => new BaseUnitSeriesDto
            {
                Topic = entry.Key,
                Unit = entry.Value.Unit,
                Count = entry.Value.DataPoints.Count,
                Downsampled = entry.Value.Downsampled,
                Timestamps = entry.Value.DataPoints.Select(point => ToEpochMicroseconds(point.Timestamp)).ToList(),
                Values = entry.Value.DataPoints.Select(point => point.Value).ToList(),
            }).ToList(),
        };

    /// <summary>Maps string series keyed by topic into a <see cref="StringSeriesResponseDto"/>.</summary>
    internal static StringSeriesResponseDto ToStringSeriesResponse(Dictionary<string, StringSeriesRequestDto> records) =>
        new()
        {
            Series = records.Select(entry => new StringSeriesDto
            {
                Topic = entry.Key,
                Count = entry.Value.DataPoints.Count,
                Downsampled = entry.Value.Downsampled,
                Timestamps = entry.Value.DataPoints.Select(point => ToEpochMicroseconds(point.Timestamp)).ToList(),
                Values = entry.Value.DataPoints.Select(point => point.Value ?? string.Empty).ToList(),
            }).ToList(),
        };

    /// <summary>Maps boolean series keyed by topic into a <see cref="BooleanSeriesResponseDto"/>.</summary>
    internal static BooleanSeriesResponseDto ToBooleanSeriesResponse(Dictionary<string, BooleanSeriesRequestDto> records) =>
        new()
        {
            Series = records.Select(entry => new BooleanSeriesDto
            {
                Topic = entry.Key,
                Count = entry.Value.DataPoints.Count,
                Downsampled = entry.Value.Downsampled,
                Timestamps = entry.Value.DataPoints.Select(point => ToEpochMicroseconds(point.Timestamp)).ToList(),
                Values = entry.Value.DataPoints.Select(point => point.Value).ToList(),
            }).ToList(),
        };

    /// <summary>Converts a timestamp to Unix epoch microseconds (UTC).</summary>
    internal static long ToEpochMicroseconds(DateTime timestamp)
    {
        var utcTimestamp = timestamp.Kind == DateTimeKind.Utc ? timestamp : timestamp.ToUniversalTime();
        return (utcTimestamp.Ticks - DateTime.UnixEpoch.Ticks) / 10;
    }
}
