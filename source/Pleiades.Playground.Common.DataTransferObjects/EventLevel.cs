using System.Text.Json.Serialization;

namespace Pleiades.Playground.Common.DataTransferObjects;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EventLevel
{
    Silent,
    Information,
    Warning,
    Error
}
