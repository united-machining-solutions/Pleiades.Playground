using System.Text.Json.Serialization;

namespace Pleiades.Playground.Notification.DataTransferObjects;

/// <summary>
/// Type of control element in a confirmation dialog.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ControlType
{
    /// <summary>
    /// Editable field for a physical value (numeric with unit).
    /// </summary>
    EditFieldPhysicalValue,

    /// <summary>
    /// Editable field for a string value.
    /// </summary>
    EditFieldString,

    /// <summary>
    /// Check box control.
    /// </summary>
    CheckBox,

    /// <summary>
    /// Combo box (dropdown) control.
    /// </summary>
    ComboBox,
}

/// <summary>
/// Represents a control structure element in a confirmation dialog (e.g., input field, checkbox, combobox).
/// </summary>
public record ControlStructureDtoV1
{
    /// <summary>
    /// Label text displayed next to the control element.
    /// </summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// Type of the control element.
    /// </summary>
    public ControlType ControlType { get; set; }

    /// <summary>
    /// Number of decimal places for physical value fields (optional).
    /// </summary>
    public uint? NumberOfDecimalPlaces { get; set; }

    /// <summary>
    /// Item source for combo box controls (optional).
    /// </summary>
    public ICollection<string>? ComboBoxItemSource { get; init; } = [];

    /// <summary>
    /// Reference value for physical value fields (optional).
    /// </summary>
    public double? ReferenceValue { get; set; }

    /// <summary>
    /// Whether the control is initially filled with a value (optional).
    /// </summary>
    public bool? IsInitiallyFilled { get; set; }
}
