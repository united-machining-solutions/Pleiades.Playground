using System.Text.Json;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// One event of Socket.IO 1.x as it travels in a WebSocket text frame (Engine.IO 3):
/// <c>42/production,["state","waitingOrder"]</c>. The namespace is left out for the default one.
/// </summary>
internal readonly record struct SocketIoFrame(string Channel, string Name, JsonElement Value)
{
    internal const string Open = "0";
    internal const string Ping = "2";
    internal const string Connect = "40";
    internal const string Event = "42";

    /// <summary>Reads an event frame. Returns false for every other frame and for a malformed one.</summary>
    internal static bool TryParse(string text, out SocketIoFrame frame)
    {
        frame = default;
        if (!text.StartsWith(Event, StringComparison.Ordinal))
        {
            return false;
        }

        var rest = text.AsSpan(Event.Length);
        var channel = "/";
        if (rest.StartsWith("/"))
        {
            var comma = rest.IndexOf(',');
            if (comma < 0)
            {
                return false;
            }

            channel = rest[..comma].ToString();
            rest = rest[(comma + 1)..];
        }

        // An acknowledgement id may stand before the payload.
        rest = rest.TrimStart("0123456789");
        try
        {
            using var document = JsonDocument.Parse(rest.ToString());
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0 || root[0].ValueKind != JsonValueKind.String)
            {
                return false;
            }

            var value = root.GetArrayLength() > 1 ? root[1].Clone() : default;
            frame = new(channel, root[0].GetString()!, value);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>The frame that joins a namespace.</summary>
    internal static string Join(string channel) => Connect + channel;

    /// <summary>The frame that emits an event with one text argument.</summary>
    internal static string Emit(string channel, string name, string argument)
        => Event + channel + "," + JsonSerializer.Serialize(new[] { name, argument });
}
