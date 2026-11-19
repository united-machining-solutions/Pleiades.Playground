using System.Diagnostics.CodeAnalysis;
using System.Xml.Serialization;
using Pleiades.Playground.Bend.Protocol.Model;

namespace Pleiades.Playground.Bend.Protocol.Telegrams;

/// <summary>
/// One message file of the machine (RCI interface description, chapter 4.2): the root <c>RCIInterface</c>
/// with the messages it carries. The simulator writes one message per file.
/// </summary>
[XmlRoot(ElementName = "RCIInterface", IsNullable = false)]
[SuppressMessage("Performance", "CA1819:Properties should not return arrays", Justification = "Shape of the telegram")]
public class RciTelegram
{
    /// <summary>The version of the interface.</summary>
    [XmlAttribute(AttributeName = "Version")]
    public string Version { get; set; } = "3.2";

    /// <summary>Part feedbacks of manufacturing orders.</summary>
    [XmlElement(ElementName = "ManufacturingOrderFeedback")]
    public RciOrderMessage[]? ManufacturingOrderFeedbacks { get; set; }

    /// <summary>The start of the processing of manufacturing orders (interface description 4.2.1).</summary>
    [XmlElement(ElementName = "ProcessingStarted")]
    public RciProcessingMessage[]? ProcessingsStarted { get; set; }

    /// <summary>The end of the processing of manufacturing orders: finished or paused (interface description 4.2.3).</summary>
    [XmlElement(ElementName = "ProcessingStopped")]
    public RciProcessingMessage[]? ProcessingsStopped { get; set; }

    /// <summary>Feedbacks of production packages.</summary>
    [XmlElement(ElementName = "ProductionPackageFeedback")]
    public RciPackageMessage[]? ProductionPackageFeedbacks { get; set; }

    /// <summary>Operating states.</summary>
    [XmlElement(ElementName = "OperatingStateFeedback")]
    public RciOperatingStateMessage[]? OperatingStateFeedbacks { get; set; }
}

/// <summary>A message about manufacturing orders.</summary>
[SuppressMessage("Performance", "CA1819:Properties should not return arrays", Justification = "Shape of the telegram")]
public class RciOrderMessage
{
    /// <summary>Local time of the machine, <c>yyyy.MM.dd HH:mm:ss</c>.</summary>
    [XmlElement(DataType = "string", ElementName = "Timestamp")]
    public string? Timestamp { get; set; }

    /// <summary>The operator.</summary>
    [XmlElement(DataType = "string", ElementName = "ReportedBy")]
    public string? ReportedBy { get; set; }

    /// <summary>The orders, each with the name of its package.</summary>
    [XmlElement(ElementName = "ManufacturingOrder")]
    public RciOrderInPackage[]? ManufacturingOrders { get; set; }
}

/// <summary>
/// <c>ProcessingStarted</c> or <c>ProcessingStopped</c>: the machine started or ended the processing of the orders.
/// The status of an order says how: 7 active at the start, 14 finished or 12 paused at the end.
/// </summary>
public class RciProcessingMessage : RciOrderMessage
{
    /// <summary>The number of <see cref="RciProcessingTimeType"/>: which time the machine counted.</summary>
    [XmlElement(DataType = "string", ElementName = "Type", IsNullable = false)]
    public string? Type { get; set; }
}

/// <summary>A manufacturing order in a message, with the name of its production package.</summary>
public class RciOrderInPackage : ManufacturingOrder
{
    /// <summary>For the serializer.</summary>
    public RciOrderInPackage()
    {
    }

    /// <summary>A copy of the order, in the package of the given name.</summary>
    public RciOrderInPackage(ManufacturingOrder order, string productionPackageName)
    {
        CopyFrom(order);
        ProductionPackageName = productionPackageName;
    }

    /// <summary>The name of the production package.</summary>
    [XmlAttribute(DataType = "string", AttributeName = "Name")]
    public string? ProductionPackageName { get; set; }
}

/// <summary>A message about production packages.</summary>
[SuppressMessage("Performance", "CA1819:Properties should not return arrays", Justification = "Shape of the telegram")]
public class RciPackageMessage
{
    /// <summary>Local time of the machine, <c>yyyy.MM.dd HH:mm:ss</c>.</summary>
    [XmlElement(DataType = "string", ElementName = "Timestamp")]
    public string? Timestamp { get; set; }

    /// <summary>The operator.</summary>
    [XmlElement(DataType = "string", ElementName = "ReportedBy")]
    public string ReportedBy { get; set; } = string.Empty;

    /// <summary>The packages.</summary>
    [XmlElement(ElementName = "ProductionPackage")]
    public RciPackageState[]? ProductionPackages { get; set; }
}

/// <summary>How far a production package is.</summary>
public class RciPackageState
{
    /// <summary>The name of the package.</summary>
    [XmlAttribute(DataType = "string", AttributeName = "Name")]
    public string ProductionPackageName { get; set; } = string.Empty;

    /// <summary>How often the kit is made.</summary>
    [XmlElement(DataType = "int", ElementName = "DesiredQuantity")]
    public int DesiredQuantity { get; set; }

    /// <summary>How often the kit is made so far.</summary>
    [XmlElement(DataType = "int", ElementName = "ProcessedQuantity")]
    public int ProcessedQuantity { get; set; }

    /// <summary>The number of <see cref="RciPackageStatus"/>.</summary>
    [XmlElement(DataType = "string", ElementName = "Status", IsNullable = false)]
    public string? StatusText { get; set; }
}

/// <summary>An operating state of the machine.</summary>
public class RciOperatingStateMessage
{
    /// <summary>Local time of the machine, <c>yyyy.MM.dd HH:mm:ss</c>.</summary>
    [XmlElement(DataType = "string", ElementName = "Timestamp")]
    public string? Timestamp { get; set; }

    /// <summary>The operator.</summary>
    [XmlElement(DataType = "string", ElementName = "ReportedBy")]
    public string ReportedBy { get; set; } = string.Empty;

    /// <summary>The number of <see cref="RciOperatingState"/>.</summary>
    [XmlElement(DataType = "string", ElementName = "OperatingState")]
    public string? OperatingState { get; set; }

    /// <summary>The error number of a fault.</summary>
    [XmlElement(DataType = "string", ElementName = "ErrorNo", IsNullable = false)]
    public string ErrorNo { get; set; } = string.Empty;

    /// <summary>The error text of a fault.</summary>
    [XmlElement(DataType = "string", ElementName = "ErrorText", IsNullable = false)]
    public string ErrorText { get; set; } = string.Empty;
}
