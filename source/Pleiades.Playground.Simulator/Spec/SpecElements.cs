// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// The paths, enum values and unit names of the data model that the virtual machine publishes. Only names and
/// values, no texts of the model (see contracts/datamodel). The unit is the name the binding sends with a number.
/// </summary>
internal static class SpecElements
{
    public const string ModelVersion = "0.12.0";
    public const string BindingVersion = "0.1.0-draft";

    public const string Manufacturer = "Identification.Manufacturer";
    public const string SerialNumber = "Identification.SerialNumber";
    public const string ProductInstanceUri = "Identification.ProductInstanceUri";
    public const string Heartbeat = "Connection.Heartbeat";
    public const string ConnectionState = "Connection.State";
    public const string Status = "State.Status";
    public const string FeedOverride = "State.FeedOverride";
    public const string ChannelState = "Channel.1.ChannelState";
    public const string JobOrders = "Production.JobOrders";
    public const string ActiveProgram = "Production.ActiveProgram";
    public const string ProgramExecution = "Production.ProgramExecution";
    public const string PartsProducedInLifetime = "OperationCounters.PartsProducedInLifetime";
    public const string PowerOnDuration = "OperationCounters.PowerOnDuration";
    public const string ActiveAlerts = "Notification.ActiveAlerts";
    public const string SpindleIsRotating = "Spindle.1.IsRotating";
    public const string SpindleOverride = "Spindle.1.Override";
    public const string ActivePower = "Consumption.Electricity.Main.AcActivePowerTotal";
    public const string ActiveEnergy = "Consumption.Electricity.Main.AcActiveEnergyTotalImportHp";

    public const string ProgramExecutionStarted = "Production.ProgramExecutionStarted";
    public const string ProgramExecutionEnded = "Production.ProgramExecutionEnded";
    public const string JobOrderAdded = "Production.JobOrderAdded";
    public const string JobOrderChanged = "Production.JobOrderChanged";
    public const string JobOrderRemoved = "Production.JobOrderRemoved";
    public const string AlertRaised = "Notification.AlertRaised";
    public const string AlertChanged = "Notification.AlertChanged";
    public const string AlertCleared = "Notification.AlertCleared";

    public const string UnitOne = "one";
    public const string UnitSecond = "second";
    public const string UnitPiece = "piece";
    public const string UnitWatt = "watt";
    public const string UnitWattHour = "wattHour";

    /// <summary>The profiles the manifest declares.</summary>
    public static readonly IReadOnlyList<string> Profiles = ["Core", "Production", "Spindle", "Energy", "AlertsEvents"];

    /// <summary>Every element the virtual machine publishes, in the order of the manifest.</summary>
    public static readonly IReadOnlyList<SpecElement> Elements =
    [
        new(Manufacturer, null, "adapter", false),
        new(SerialNumber, null, "adapter", false),
        new(ProductInstanceUri, null, "adapter", false),
        new(Heartbeat, null, "adapter", false),
        new(ConnectionState, null, "adapter", false),
        new(Status, null, "source", false),
        new(FeedOverride, UnitOne, "source", false),
        new(ChannelState, null, "source", true),
        new(JobOrders, null, "source", false),
        new(ActiveProgram, null, "source", true),
        new(ProgramExecution, null, "source", true),
        new(PartsProducedInLifetime, UnitPiece, "source", false),
        new(ActiveAlerts, null, "source", true),
        new(PowerOnDuration, UnitSecond, "source", false),
        new(SpindleIsRotating, null, "source", false),
        new(SpindleOverride, UnitOne, "source", false),
        new(ActivePower, UnitWatt, "source", false),
        new(ActiveEnergy, UnitWattHour, "source", false),
    ];

    /// <summary>The events the virtual machine publishes.</summary>
    public static readonly IReadOnlyList<string> Events =
    [
        ProgramExecutionStarted, ProgramExecutionEnded,
        JobOrderAdded, JobOrderChanged, JobOrderRemoved,
        AlertRaised, AlertChanged, AlertCleared,
    ];

    /// <summary>The unit name of a numeric element, or <see langword="null"/> when it has none.</summary>
    public static string? UnitOf(string path)
    {
        return Elements.FirstOrDefault(e => e.Path == path)?.Unit;
    }
}

/// <summary>An element of the manifest.</summary>
/// <param name="Path">Path in the data model.</param>
/// <param name="Unit">Unit name sent with a numeric value, or <see langword="null"/>.</param>
/// <param name="TimestampSource">Whether the timestamp is source or adapter time.</param>
/// <param name="CorrelationId">Whether the envelope carries a correlationId while a program runs.</param>
internal sealed record SpecElement(string Path, string? Unit, string TimestampSource, bool CorrelationId);
