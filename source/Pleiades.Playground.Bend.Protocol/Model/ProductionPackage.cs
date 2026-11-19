using System.Diagnostics.CodeAnalysis;
using System.Xml.Serialization;

namespace Pleiades.Playground.Bend.Protocol.Model;

/// <summary>
/// A production package: a kit of manufacturing orders that is made <see cref="DesiredQuantity"/> times.
/// </summary>
[XmlType(TypeName = "ProductionPackage")]
public class ProductionPackage
{
    /// <summary>The name, unique on the machine.</summary>
    [XmlAttribute(DataType = "string", AttributeName = "Name")]
    public string ProductionPackageName { get; set; } = string.Empty;

    /// <summary>How often the kit is made.</summary>
    [XmlElement(DataType = "int", ElementName = "DesiredQuantity")]
    public int DesiredQuantity { get; set; }

    /// <summary>How often the kit is made so far.</summary>
    [XmlElement(DataType = "int", ElementName = "ProcessedQuantity")]
    public int ProcessedQuantity { get; set; }

    /// <summary>The position in the production plan.</summary>
    [XmlElement(DataType = "int", ElementName = "PositionNo")]
    public int PositionNo { get; set; }

    /// <summary>The operator who works on the package.</summary>
    [XmlAttribute(DataType = "string", AttributeName = "ReportedBy")]
    public string? ReportedBy { get; set; }

    /// <summary>The positions of the package.</summary>
    [XmlArray("ManufacturingOrders", IsNullable = false)]
    [SuppressMessage("Performance", "CA1819:Properties should not return arrays", Justification = "Shape of the telegram")]
    public ManufacturingOrder[] ManufacturingOrders { get; set; } = [];

    /// <inheritdoc />
    public override string ToString() => ProductionPackageName;
}
