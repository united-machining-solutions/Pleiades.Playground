// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Bson.IO;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Mapping;

/// <summary>Turns a CloudEvent into what is stored, and what is stored back into the event of the API.</summary>
internal static class MachineEventMapper
{
    private static readonly JsonWriterSettings RelaxedJson = new() { OutputMode = JsonOutputMode.RelaxedExtendedJson };

    /// <summary>
    /// The stored form of a CloudEvent 1.0 in structured mode. It must carry <c>specversion</c> 1.0, <c>id</c>,
    /// <c>source</c>, <c>type</c>, <c>time</c> and an object as <c>data</c>; the event itself is kept unchanged.
    /// </summary>
    /// <exception cref="ArgumentException">The event is not such a CloudEvent, or the machine id is empty.</exception>
    public static MachineEventDao ToDao(string mId, JsonElement cloudEvent, DateTime receivedAt)
    {
        if (string.IsNullOrWhiteSpace(mId))
        {
            throw new ArgumentException("The machine id is missing.", nameof(mId));
        }
        if (cloudEvent.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException("The CloudEvent is not a JSON object.", nameof(cloudEvent));
        }
        if (Text(cloudEvent, "specversion") != "1.0")
        {
            throw new ArgumentException("The CloudEvent has no specversion 1.0.", nameof(cloudEvent));
        }
        var id = Required(cloudEvent, "id");
        var source = Required(cloudEvent, "source");
        var type = Required(cloudEvent, "type");
        var time = Text(cloudEvent, "time") is { } t && DateTime.TryParse(t, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed
            : throw new ArgumentException("The CloudEvent has no valid time.", nameof(cloudEvent));
        if (!cloudEvent.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException("The CloudEvent has no object as data.", nameof(cloudEvent));
        }

        var sequence = Text(cloudEvent, "sequence");
        string? prefix = null;
        long? count = null;
        var dot = sequence?.LastIndexOf('.') ?? -1;
        if (sequence is not null && dot > 0
            && long.TryParse(sequence[(dot + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var number))
        {
            prefix = sequence[..dot];
            count = number;
        }

        return new MachineEventDao
        {
            Key = $"{source} {id}",
            MId = mId,
            Group = type.Split('.')[0],
            Type = type,
            Source = source,
            EventId = id,
            Time = time,
            Sequence = sequence,
            SequencePrefix = prefix,
            SequenceCount = count,
            CorrelationId = Text(cloudEvent, "correlationid"),
            Data = BsonDocument.Parse(data.GetRawText()),
            Event = BsonDocument.Parse(cloudEvent.GetRawText()),
            ReceivedAt = receivedAt,
        };
    }

    /// <summary>The event of the API: its attributes and its data as they came.</summary>
    public static MachineEventDtoV1 ToDto(MachineEventDao dao)
    {
        ArgumentNullException.ThrowIfNull(dao);
        using var data = JsonDocument.Parse(dao.Data.ToJson(RelaxedJson));
        return new MachineEventDtoV1
        {
            MId = dao.MId,
            Group = dao.Group,
            Type = dao.Type,
            Id = dao.EventId,
            Source = dao.Source,
            Time = DateTime.SpecifyKind(dao.Time, DateTimeKind.Utc),
            Sequence = dao.Sequence,
            CorrelationId = dao.CorrelationId,
            Data = data.RootElement.Clone(),
            ReceivedAt = DateTime.SpecifyKind(dao.ReceivedAt, DateTimeKind.Utc),
        };
    }

    /// <summary>The events of the API, in the same order.</summary>
    public static List<MachineEventDtoV1> ToDtos(IEnumerable<MachineEventDao> daos) => [.. daos.Select(ToDto)];

    private static string? Text(JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    private static string Required(JsonElement element, string name)
    {
        return Text(element, name) is { Length: > 0 } value
            ? value
            : throw new ArgumentException($"The CloudEvent has no {name}.", nameof(element));
    }
}
