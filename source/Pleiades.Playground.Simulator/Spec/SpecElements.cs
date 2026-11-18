// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// The paths, enum values and unit names of the data model that the virtual machine publishes. Only names and
/// values, no texts of the model (see contracts/datamodel). The unit is the name the binding sends with a number.
/// </summary>
internal static class SpecElements
{
    public const string ModelVersion = "0.17.1";
    public const string BindingVersion = "0.1.0-draft";

    public const string Manufacturer = "Identification.Manufacturer";
    public const string SerialNumber = "Identification.SerialNumber";
    public const string ProductInstanceUri = "Identification.ProductInstanceUri";
    public const string Model = "Identification.Model";
    public const string ManufacturerUri = "Identification.ManufacturerUri";
    public const string ProductCode = "Identification.ProductCode";
    public const string YearOfConstruction = "Identification.YearOfConstruction";
    public const string HardwareRevision = "Identification.HardwareRevision";
    public const string MonthOfConstruction = "Identification.MonthOfConstruction";
    public const string InitialOperationDate = "Identification.InitialOperationDate";
    public const string DeviceClass = "Identification.DeviceClass";
    public const string AssetId = "Identification.AssetId";
    public const string ComponentName = "Identification.ComponentName";
    public const string Location = "Identification.Location";
    public const string Software = "Components.Software";
    public const string Heartbeat = "Connection.Heartbeat";
    public const string ConnectionState = "Connection.State";
    public const string Status = "State.Status";
    public const string FeedOverride = "State.FeedOverride";
    public const string IsWarmUp = "State.IsWarmUp";
    public const string ChannelState = "Channel.1.ChannelState";
    public const string ChannelFeedOverride = "Channel.1.FeedOverride";
    public const string ChannelMode = "Channel.1.ChannelMode";
    public const string RapidOverride = "Channel.1.RapidOverride";
    public const string ChannelName = "Channel.1.Name";
    public const string JobOrders = "JobMonitoring.JobOrders";
    public const string JobOrderResults = "JobMonitoring.JobOrderResults";
    public const string ActiveWorkMaster = "WorkMasterMonitoring.ActiveWorkMaster";
    public const string ProgramExecution = "WorkMasterMonitoring.ProgramExecution";
    public const string PartsProducedInLifetime = "OperationCounters.PartsProducedInLifetime";
    public const string PowerOnDuration = "OperationCounters.PowerOnDuration";
    public const string OperationDuration = "OperationCounters.OperationDuration";
    public const string ActiveAlerts = "Notification.ActiveAlerts";
    public const string SpindleIsRotating = "Spindle.1.IsRotating";
    public const string SpindleOverride = "Spindle.1.Override";
    public const string SpindleIsUsedAsAxis = "Spindle.1.IsUsedAsAxis";
    public const string SpindleName = "Spindle.1.Name";
    public const string StacklightMode = "Stacklight.StacklightMode";
    public const string StackElement = "Stacklight.StackElement";
    public const string ActivePower = "Consumption.Electricity.Main.AcActivePowerTotal";
    public const string ActiveEnergy = "Consumption.Electricity.Main.AcActiveEnergyTotalImportHp";

    public const string ProgramExecutionStarted = "WorkMasterMonitoring.ProgramExecutionStarted";
    public const string ProgramExecutionInterrupted = "WorkMasterMonitoring.ProgramExecutionInterrupted";
    public const string ProgramExecutionResumed = "WorkMasterMonitoring.ProgramExecutionResumed";
    public const string ProgramExecutionEnded = "WorkMasterMonitoring.ProgramExecutionEnded";
    public const string ProgramExecutionAborted = "WorkMasterMonitoring.ProgramExecutionAborted";
    public const string JobOrderAdded = "JobMonitoring.JobOrderAdded";
    public const string JobOrderReleased = "JobMonitoring.JobOrderReleased";
    public const string JobOrderRevoked = "JobMonitoring.JobOrderRevoked";
    public const string JobOrderStarted = "JobMonitoring.JobOrderStarted";
    public const string JobOrderInterrupted = "JobMonitoring.JobOrderInterrupted";
    public const string JobOrderResumed = "JobMonitoring.JobOrderResumed";
    public const string JobOrderEnded = "JobMonitoring.JobOrderEnded";
    public const string JobOrderAborted = "JobMonitoring.JobOrderAborted";
    public const string JobOrderCancelled = "JobMonitoring.JobOrderCancelled";
    public const string JobOrderChanged = "JobMonitoring.JobOrderChanged";
    public const string JobOrderResultChanged = "JobMonitoring.JobOrderResultChanged";
    public const string JobOrderRemoved = "JobMonitoring.JobOrderRemoved";
    public const string AlertRaised = "Notification.AlertRaised";
    public const string AlertChanged = "Notification.AlertChanged";
    public const string AlertCleared = "Notification.AlertCleared";
    public const string NotificationEvent = "Notification.NotificationEvent";

    public const string UnitOne = "one";
    public const string UnitSecond = "second";
    public const string UnitPiece = "piece";
    public const string UnitWatt = "watt";
    public const string UnitWattHour = "wattHour";
    public const string UnitDegreeCelsius = "degreeCelsius";

    /// <summary>Path of the bearing temperature of spindle 1 below the prefix of the manufacturer.</summary>
    public const string BearingTemperature = "Spindle.1.BearingTemperature";

    /// <summary>
    /// Path of the name of the active NC program below the prefix of the manufacturer. The work master is an id of
    /// its own (<see cref="ActiveWorkMaster"/>); the model has no element for the program that carries it out.
    /// </summary>
    public const string ActiveProgram = "WorkMasterMonitoring.ActiveProgram";

    /// <summary>
    /// The signals of the manufacturer, in the same tree as the elements of the model. Their paths are relative to
    /// the prefix <c>x-&lt;domain&gt;</c> (<see cref="ExtensionPrefix"/>); type and unit are named in the manifest, as
    /// the rule of the model for extensions asks, and the unit follows its rules: a temperature in degrees Celsius.
    /// </summary>
    public static readonly IReadOnlyList<SpecExtension> Extensions =
    [
        new(BearingTemperature, "number", "CEL", UnitDegreeCelsius, "Temperature of the bearing of spindle 1"),
        new(ActiveProgram, "string", null, null, "Name of the NC program that carries out the active work master"),
    ];

    /// <summary>The profiles the manifest declares.</summary>
    public static readonly IReadOnlyList<string> Profiles =
    [
        "Core", "IdentificationExtended", "Components", "MonitoringExtended", "ChannelMonitoring", "Spindle",
        "Stacklight", "EnergyElectricity", "JobMonitoring", "WorkMasterMonitoring", "AlertsEvents",
    ];

    /// <summary>
    /// Every element the virtual machine publishes, in the order of the manifest: each element of every profile it
    /// declares, since a declared profile is delivered whole (an element the machine lacks says
    /// <c>"available": false</c>).
    /// </summary>
    public static readonly IReadOnlyList<SpecElement> Elements =
    [
        // Core
        new(Manufacturer, null, "adapter", false),
        new(SerialNumber, null, "adapter", false),
        new(ProductInstanceUri, null, "adapter", false),
        new(ManufacturerUri, null, "adapter", false),
        new(Model, null, "adapter", false),
        new(ProductCode, null, "adapter", false),
        new(YearOfConstruction, null, "adapter", false),
        new(Heartbeat, null, "adapter", false),
        new(ConnectionState, null, "adapter", false),
        new(Status, null, "source", false),
        new(FeedOverride, UnitOne, "source", false),
        new(ActiveAlerts, null, "source", true),
        new(PowerOnDuration, UnitSecond, "source", false),
        // IdentificationExtended
        new(HardwareRevision, null, "adapter", false),
        new(MonthOfConstruction, null, "adapter", false),
        new(InitialOperationDate, null, "adapter", false),
        new(DeviceClass, null, "adapter", false),
        new(AssetId, null, "adapter", false),
        new(ComponentName, null, "adapter", false),
        new(Location, null, "adapter", false),
        // Components
        new(Software, null, "adapter", false),
        // MonitoringExtended
        new(PartsProducedInLifetime, UnitPiece, "source", false),
        new(OperationDuration, UnitSecond, "source", false),
        new(IsWarmUp, null, "source", false),
        // ChannelMonitoring
        new(ChannelState, null, "source", true),
        new(ChannelFeedOverride, UnitOne, "source", false),
        new(ChannelMode, null, "source", false),
        new(RapidOverride, UnitOne, "source", false),
        new(ChannelName, null, "adapter", false),
        // Spindle
        new(SpindleIsRotating, null, "source", false),
        new(SpindleOverride, UnitOne, "source", false),
        new(SpindleIsUsedAsAxis, null, "source", false),
        new(SpindleName, null, "adapter", false),
        // Stacklight
        new(StacklightMode, null, "adapter", false),
        new(StackElement, null, "source", false),
        // EnergyElectricity
        new(ActivePower, UnitWatt, "source", false),
        new(ActiveEnergy, UnitWattHour, "source", false),
        // JobMonitoring
        new(JobOrders, null, "source", false),
        new(JobOrderResults, null, "source", false),
        // WorkMasterMonitoring
        new(ActiveWorkMaster, null, "source", true),
        new(ProgramExecution, null, "source", false),
    ];

    /// <summary>
    /// The elements of the profile IdentificationExtended the virtual machine does not deliver: the manifest says
    /// <c>"available": false</c> for them in every scenario.
    /// </summary>
    public static readonly IReadOnlySet<string> NotDelivered = new HashSet<string>(StringComparer.Ordinal)
    {
        HardwareRevision, AssetId, ComponentName, Location,
    };

    /// <summary>
    /// The events the virtual machine publishes, with whether they carry the attribute <c>correlationid</c>: the
    /// events of a program execution always, an alert and a notification when they came up in a program execution.
    /// </summary>
    public static readonly IReadOnlyList<SpecEventInfo> Events =
    [
        new(JobOrderAdded, false), new(JobOrderReleased, false), new(JobOrderRevoked, false),
        new(JobOrderStarted, false), new(JobOrderInterrupted, false), new(JobOrderResumed, false),
        new(JobOrderEnded, false), new(JobOrderAborted, false), new(JobOrderCancelled, false),
        new(JobOrderChanged, false), new(JobOrderResultChanged, false), new(JobOrderRemoved, false),
        new(ProgramExecutionStarted, true), new(ProgramExecutionInterrupted, true), new(ProgramExecutionResumed, true),
        new(ProgramExecutionEnded, true), new(ProgramExecutionAborted, true),
        new(AlertRaised, true), new(AlertChanged, true), new(AlertCleared, true), new(NotificationEvent, true),
    ];

    /// <summary>
    /// The prefix of the signals of a manufacturer: exactly one segment <c>x-&lt;domain&gt;</c>, every dot of the domain a
    /// <c>-</c>, for example <c>x-alcyone-machines-example</c>.
    /// </summary>
    public static string ExtensionPrefix(string manufacturerDomain)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(manufacturerDomain);
#pragma warning disable CA1308 // A domain is lower case by convention, as in the machine id.
        return $"x-{manufacturerDomain.Trim().ToLowerInvariant().Replace('.', '-')}";
#pragma warning restore CA1308
    }

    /// <summary>The full path of a signal of the manufacturer.</summary>
    public static string ExtensionPath(string manufacturerDomain, string relativePath)
    {
        return $"{ExtensionPrefix(manufacturerDomain)}.{relativePath}";
    }

    /// <summary>Every element of the manifest: those of the model, then the signals of the manufacturer.</summary>
    public static IReadOnlyList<SpecElement> ElementsFor(string manufacturerDomain)
    {
        return
        [
            .. Elements,
            .. Extensions.Select(e => new SpecElement(ExtensionPath(manufacturerDomain, e.Path), e.UnitName, "source", false, e)),
        ];
    }

    /// <summary>
    /// The five elements every adapter delivers, whatever the control: they are never <c>"available": false</c>.
    /// </summary>
    public static readonly IReadOnlySet<string> AlwaysAvailable = new HashSet<string>(StringComparer.Ordinal)
    {
        Heartbeat, ConnectionState, Manufacturer, SerialNumber, ProductInstanceUri,
    };

    /// <summary>
    /// The elements of the model a machine may lack for good, every one but <see cref="AlwaysAvailable"/>: the
    /// manifest then says <c>"available": false</c>, and the value is <see langword="null"/> once and for all.
    /// </summary>
    public static readonly IReadOnlySet<string> MayBeUnavailable = new HashSet<string>(
        Elements.Select(e => e.Path).Where(p => !AlwaysAvailable.Contains(p)), StringComparer.Ordinal);

    /// <summary>The group of an event, the first segment of its path; <c>sequence</c> counts within it.</summary>
    public static string EventGroup(string eventPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(eventPath);
        return eventPath.Split('.')[0];
    }

    /// <summary>The unit name of a numeric element, or <see langword="null"/> when it has none.</summary>
    public static string? UnitOf(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        if (path.StartsWith("x-", StringComparison.Ordinal))
        {
            var relative = path[(path.IndexOf('.', StringComparison.Ordinal) + 1)..];
            return Extensions.FirstOrDefault(e => e.Path == relative)?.UnitName;
        }
        return Elements.FirstOrDefault(e => e.Path == path)?.Unit;
    }
}

/// <summary>
/// A signal of the manufacturer: path below the prefix, type, unit (for a number) and a description for the manifest.
/// </summary>
internal sealed record SpecExtension(string Path, string Type, string? UnitCode, string? UnitName, string Description);

/// <summary>An event of the manifest, and whether it carries the attribute <c>correlationid</c>.</summary>
internal sealed record SpecEventInfo(string Path, bool CorrelationId);

/// <summary>An element of the manifest.</summary>
/// <param name="Path">Path in the data model.</param>
/// <param name="Unit">Unit name sent with a numeric value, or <see langword="null"/>.</param>
/// <param name="TimestampSource">Whether the timestamp is source or adapter time.</param>
/// <param name="CorrelationId">Whether the envelope carries a correlationId while a program runs.</param>
/// <param name="Extension">For a signal of the manufacturer, what the manifest says about it.</param>
internal sealed record SpecElement(string Path, string? Unit, string TimestampSource, bool CorrelationId, SpecExtension? Extension = null);
