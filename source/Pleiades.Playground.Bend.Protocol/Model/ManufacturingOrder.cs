using System.Globalization;
using System.Text.Json.Serialization;
using System.Xml.Serialization;

namespace Pleiades.Playground.Bend.Protocol.Model;

/// <summary>
/// A manufacturing order: one position of a production package. The members and their order are those of the
/// element <c>ManufacturingOrder</c> of the telegrams, so the same object goes into a telegram as it is. Counts
/// travel as text: an empty one is "not reported", which the typed accessors give as -1.
/// </summary>
[XmlType(TypeName = "ManufacturingOrder")]
public class ManufacturingOrder
{
    /// <summary>The order number, unique on the machine.</summary>
    [XmlAttribute(DataType = "string", AttributeName = "OrderNo")]
    public string OrderNo { get; set; } = string.Empty;

    /// <summary>The position in the package.</summary>
    [XmlElement(DataType = "int", ElementName = "PositionNo")]
    public int PositionNo { get; set; } = 1;

    /// <summary>The part number.</summary>
    [XmlElement(DataType = "string", ElementName = "PartNo")]
    public string PartNo { get; set; } = string.Empty;

    /// <summary>The order number of the part.</summary>
    [XmlElement(DataType = "string", ElementName = "PartOrderNo", IsNullable = false)]
    public string? PartOrderNo { get; set; }

    /// <summary>The operation number of the part.</summary>
    [XmlElement(DataType = "string", ElementName = "PartOperationNo", IsNullable = false)]
    public string? PartOperationNo { get; set; }

    /// <summary>The description of the part.</summary>
    [XmlElement(DataType = "string", ElementName = "PartDescription", IsNullable = false)]
    public string PartDescription { get; set; } = string.Empty;

    /// <summary>The NC program that bends the part.</summary>
    [XmlElement(DataType = "string", ElementName = "ProgramName")]
    public string ProgramName { get; set; } = string.Empty;

    /// <summary>The path of the NC program.</summary>
    [XmlElement(DataType = "string", ElementName = "ProgramPath")]
    public string ProgramPath { get; set; } = string.Empty;

    /// <summary>How many parts the order asks for.</summary>
    [XmlElement(DataType = "int", ElementName = "DesiredNumberOfParts", IsNullable = false)]
    public int DesiredNumberOfParts { get; set; } = -99;

    /// <summary>The processed parts as the telegram carries them; empty: not reported.</summary>
    [XmlElement(DataType = "string", ElementName = "ProcessedParts", IsNullable = false)]
    public string? ProcessedPartsText { get; set; }

    /// <summary>The status as the telegram carries it, the number of <see cref="RciOrderStatus"/>.</summary>
    [XmlElement(DataType = "string", ElementName = "Status", IsNullable = false)]
    public string? StatusText { get; set; }

    /// <summary>The scrap parts as the telegram carries them.</summary>
    [XmlElement(DataType = "string", ElementName = "ScrapParts", IsNullable = false)]
    public string? ScrapPartsText { get; set; }

    /// <summary>The missing parts as the telegram carries them.</summary>
    [XmlElement(DataType = "string", ElementName = "MissingParts", IsNullable = false)]
    public string? MissingPartsText { get; set; }

    /// <summary>Whether quantities are reported in total, as the telegram carries it.</summary>
    [XmlElement(DataType = "string", ElementName = "ReportTotalQuantities", IsNullable = false)]
    public string? ReportTotalQuantitiesText { get; set; }

    /// <summary>A note.</summary>
    [XmlElement(DataType = "string", ElementName = "Note", IsNullable = false)]
    public string? Note { get; set; }

    /// <summary>The priority.</summary>
    [XmlElement(DataType = "string", ElementName = "Priority", IsNullable = false)]
    public string? Priority { get; set; }

    /// <summary>The due date.</summary>
    [XmlElement(DataType = "string", ElementName = "DueDate", IsNullable = false)]
    public string? DueDate { get; set; }

    /// <summary>The order type.</summary>
    [XmlElement(DataType = "string", ElementName = "OrderType", IsNullable = false)]
    public string? OrderType { get; set; }

    /// <summary>The ident number of the resource.</summary>
    [XmlElement(DataType = "string", ElementName = "ResourceIdentNo", IsNullable = false)]
    public string? ResourceIdentNo { get; set; }

    /// <summary>The order number of the resource.</summary>
    [XmlElement(DataType = "string", ElementName = "ResourceOrderNo", IsNullable = false)]
    public string? ResourceOrderNo { get; set; }

    /// <summary>The operation number of the resource.</summary>
    [XmlElement(DataType = "string", ElementName = "ResourceOperationNo", IsNullable = false)]
    public string? ResourceOperationNo { get; set; }

    /// <summary>The processed parts; -1 when none were reported yet.</summary>
    [XmlIgnore]
    [JsonIgnore]
    public int ProcessedParts
    {
        get => ParseCount(ProcessedPartsText, -1);
        set => ProcessedPartsText = value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>The status; <see cref="RciOrderStatus.GUELTIG"/> when none is set.</summary>
    [XmlIgnore]
    [JsonIgnore]
    public RciOrderStatus Status
    {
        get => (RciOrderStatus)ParseCount(StatusText, (int)RciOrderStatus.GUELTIG);
        set => StatusText = ((int)value).ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>The scrap parts; -1 when none were reported.</summary>
    [XmlIgnore]
    [JsonIgnore]
    public int ScrapParts
    {
        get => ParseCount(ScrapPartsText, -1);
        set => ScrapPartsText = value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>The missing parts; -1 when none were reported.</summary>
    [XmlIgnore]
    [JsonIgnore]
    public int MissingParts
    {
        get => ParseCount(MissingPartsText, -1);
        set => MissingPartsText = value.ToString(CultureInfo.InvariantCulture);
    }

    /// <inheritdoc />
    public override string ToString() => OrderNo;

    /// <summary>Copies every member that travels in a telegram.</summary>
    protected void CopyFrom(ManufacturingOrder order)
    {
        ArgumentNullException.ThrowIfNull(order);
        OrderNo = order.OrderNo;
        PositionNo = order.PositionNo;
        PartNo = order.PartNo;
        PartOrderNo = order.PartOrderNo;
        PartOperationNo = order.PartOperationNo;
        PartDescription = order.PartDescription;
        ProgramName = order.ProgramName;
        ProgramPath = order.ProgramPath;
        DesiredNumberOfParts = order.DesiredNumberOfParts;
        ProcessedPartsText = order.ProcessedPartsText;
        StatusText = order.StatusText;
        ScrapPartsText = order.ScrapPartsText;
        MissingPartsText = order.MissingPartsText;
        ReportTotalQuantitiesText = order.ReportTotalQuantitiesText;
        Note = order.Note;
        Priority = order.Priority;
        DueDate = order.DueDate;
        OrderType = order.OrderType;
        ResourceIdentNo = order.ResourceIdentNo;
        ResourceOrderNo = order.ResourceOrderNo;
        ResourceOperationNo = order.ResourceOperationNo;
    }

    private static int ParseCount(string? text, int fallback)
    {
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }
}
