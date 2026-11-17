using System.Text.RegularExpressions;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>The topics of the MQTT binding (<c>contracts/mqtt</c>).</summary>
internal static partial class Topics
{
    /// <summary>The state of the connection between adapter and machine.</summary>
    public const string ConnectionState = "Connection.State";

    /// <summary>The sign of life of the adapter.</summary>
    public const string ConnectionHeartbeat = "Connection.Heartbeat";

    /// <summary>A serial number is one topic level: no <c>/</c>, <c>+</c>, <c>#</c> and no white space.</summary>
    public static bool IsSerialNumber(string? value) => value is not null && SerialNumber().IsMatch(value);

    /// <summary>
    /// A path is <c>Group.Element</c> with optional instance keys, for example
    /// <c>Consumption.Electricity[Main].AcActivePowerTotal</c>.
    /// </summary>
    public static bool IsPath(string? value) => value is not null && Path().IsMatch(value);

    /// <summary>
    /// The topic of a value: every dot and every instance key of the path is one level, so
    /// <c>Channel[1].ChannelState</c> becomes <c>machines/{serialNumber}/umati/Channel/1/ChannelState</c>.
    /// </summary>
    public static string Value(string serialNumber, string area, string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        var levels = path.Replace("[", "/", StringComparison.Ordinal)
            .Replace("]", string.Empty, StringComparison.Ordinal)
            .Replace('.', '/');
        return $"machines/{serialNumber}/{area}/{levels}";
    }

    /// <summary>The topic of the notification events of a machine.</summary>
    public static string Notifications(string serialNumber) => $"machines/{serialNumber}/events/notifications";

    [GeneratedRegex(@"^[^/+#\s]+$")]
    private static partial Regex SerialNumber();

    [GeneratedRegex(@"^[A-Za-z0-9]+(\[[A-Za-z0-9]+\])?(\.[A-Za-z0-9]+(\[[A-Za-z0-9]+\])?)+$")]
    private static partial Regex Path();
}
