using System.Globalization;
using System.Xml.Linq;

namespace Pleiades.Playground.Bend.Protocol.Telegrams;

/// <summary>One fact a Bend machine reported in an RCI message, with the time it was observed (UTC).</summary>
public abstract record RciObservation(DateTime Timestamp);

/// <summary>
/// <c>OperatingStateFeedback</c>: -1 fault, 0 idle, 1 running, 2 maintenance, 3 offline
/// (Bend RCI interface description, chapter 4.2).
/// </summary>
public sealed record OperatingStateObserved(DateTime Timestamp, int OperatingState, string ErrorNo, string ErrorText)
    : RciObservation(Timestamp);

/// <summary>What happened to a manufacturing order.</summary>
public enum OrderEvent
{
    /// <summary><c>ManufacturingOrderFeedback</c>: the processed parts so far.</summary>
    Feedback,

    /// <summary><c>ProcessingStarted</c>.</summary>
    Started,

    /// <summary><c>ProcessingStopped</c>.</summary>
    Stopped,
}

/// <summary>A manufacturing order (a position of a production package) and its quantities.</summary>
public sealed record OrderObserved(
    DateTime Timestamp,
    OrderEvent Event,
    string ProductionPackage,
    string OrderNo,
    string PartNo,
    string ProgramName,
    int? ProcessedParts,
    int? DesiredParts,
    int? ScrapParts) : RciObservation(Timestamp);

/// <summary>
/// <c>ProductionPackageFeedback</c>, <c>ProductionPackageStarted</c>, <c>ProductionPackageStopped</c>:
/// how often a package (a kit) is done.
/// </summary>
public sealed record PackageObserved(DateTime Timestamp, string Name, int? DesiredQuantity, int? ProcessedQuantity)
    : RciObservation(Timestamp);

/// <summary><c>OperatorMessage</c>.</summary>
public sealed record OperatorMessageObserved(DateTime Timestamp, string MessageNo, string MessageText)
    : RciObservation(Timestamp);

/// <summary>
/// Reads the messages a Bend machine writes to its RCI transfer directory. It reads the XML as it is and
/// needs no code of the machine; responses to commands carry no machine data and are skipped.
/// </summary>
public sealed class RciTelegramParser
{
    

    private readonly TimeZoneInfo _machineTimeZone;

    /// <param name="machineTimeZone">The time zone of the machine: telegram timestamps are its local time.</param>
    public RciTelegramParser(TimeZoneInfo machineTimeZone)
    {
        _machineTimeZone = machineTimeZone ?? throw new ArgumentNullException(nameof(machineTimeZone));
    }

    /// <summary>Parses one message file.</summary>
    /// <param name="xml">The content of the file.</param>
    /// <param name="fallbackTimestamp">The time (UTC) of an observation whose message carries none, the time the file was written.</param>
    /// <returns>The observations in the order of the message.</returns>
    /// <exception cref="System.Xml.XmlException">The content is no complete XML document, for example while it is still being written.</exception>
    public IReadOnlyList<RciObservation> Parse(string xml, DateTime fallbackTimestamp)
    {
        var root = XDocument.Parse(xml).Root;
        if (root is null || root.Name.LocalName != "RCIInterface")
        {
            return [];
        }

        var observations = new List<RciObservation>();
        foreach (var element in root.Elements())
        {
            var timestamp = ParseTimestamp(Text(element, "Timestamp")) ?? fallbackTimestamp;
            switch (element.Name.LocalName)
            {
                case "OperatingStateFeedback":
                    if (ParseSignedInt(Text(element, "OperatingState")) is { } state)
                    {
                        observations.Add(new OperatingStateObserved(
                            timestamp, state, Text(element, "ErrorNo") ?? string.Empty, Text(element, "ErrorText") ?? string.Empty));
                    }

                    break;
                case "ManufacturingOrderFeedback":
                    observations.AddRange(Orders(element, timestamp, OrderEvent.Feedback));
                    break;
                case "ProcessingStarted":
                case "ProcessingStartedAdditionalOperator":
                    observations.AddRange(Orders(element, timestamp, OrderEvent.Started));
                    break;
                case "ProcessingStopped":
                case "ProcessingStoppedAdditionalOperator":
                    observations.AddRange(Orders(element, timestamp, OrderEvent.Stopped));
                    break;
                case "ProductionPackageFeedback":
                case "ProductionPackageStarted":
                case "ProductionPackageStopped":
                    observations.AddRange(element.Elements("ProductionPackage").Select(package => new PackageObserved(
                        timestamp,
                        (string?)package.Attribute("Name") ?? string.Empty,
                        ParseInt(Text(package, "DesiredQuantity")),
                        ParseInt(Text(package, "ProcessedQuantity")))));
                    break;
                case "OperatorMessage":
                    observations.Add(new OperatorMessageObserved(
                        timestamp, Text(element, "MessageNo") ?? string.Empty, Text(element, "MessageText") ?? string.Empty));
                    break;
                default:
                    // Responses to commands of the server and the production plan status carry no machine data.
                    break;
            }
        }

        return observations;
    }

    private static IEnumerable<OrderObserved> Orders(XElement message, DateTime timestamp, OrderEvent orderEvent)
    {
        return message.Elements("ManufacturingOrder").Select(order => new OrderObserved(
            timestamp,
            orderEvent,
            (string?)order.Attribute("Name") ?? string.Empty,
            (string?)order.Attribute("OrderNo") ?? string.Empty,
            Text(order, "PartNo") ?? string.Empty,
            Text(order, "ProgramName") ?? string.Empty,
            ParseInt(Text(order, "ProcessedParts")),
            ParseInt(Text(order, "DesiredNumberOfParts")),
            ParseInt(Text(order, "ScrapParts"))));
    }

    private static string? Text(XElement parent, string name)
    {
        var value = parent.Element(name)?.Value.Trim();
        return string.IsNullOrEmpty(value) ? null : value;
    }

    private static int? ParseSignedInt(string? text)
    {
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    /// <summary>A quantity: negative numbers are the "unknown" of the RCI and give none.</summary>
    private static int? ParseInt(string? text)
    {
        return ParseSignedInt(text) is { } value && value >= 0 ? value : null;
    }

    /// <summary>RCI timestamps are local time of the machine, <c>yyyy.MM.dd HH:mm:ss</c>.</summary>
    private DateTime? ParseTimestamp(string? text)
    {
        if (!DateTime.TryParseExact(text, Transport.RciChannelOptions.TimestampFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var local))
        {
            return null;
        }

        try
        {
            return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), _machineTimeZone);
        }
        catch (ArgumentException)
        {
            // A local time that does not exist (the hour skipped when the clocks go forward).
            return null;
        }
    }
}
