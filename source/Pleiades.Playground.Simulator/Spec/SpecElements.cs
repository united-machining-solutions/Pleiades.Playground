// SPDX-License-Identifier: Apache-2.0
namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// The paths, enum values and unit names of the data model that the virtual machine publishes. Only names and
/// values, no texts of the model (see contracts/datamodel). The unit is the name the binding sends with a number.
/// </summary>
internal static class SpecElements
{
    public const string ModelVersion = "0.15.0";
    public const string BindingVersion = "0.1.0-draft";

    public const string Manufacturer = "Identification.Manufacturer";
    public const string SerialNumber = "Identification.SerialNumber";
    public const string ProductInstanceUri = "Identification.ProductInstanceUri";
    public const string Model = "Identification.Model";
    public const string ManufacturerUri = "Identification.ManufacturerUri";
    public const string ProductCode = "Identification.ProductCode";
    public const string YearOfConstruction = "Identification.YearOfConstruction";
    public const string SoftwareRevision = "Identification.SoftwareRevision";
    public const string Heartbeat = "Connection.Heartbeat";
    public const string ConnectionState = "Connection.State";
    public const string Status = "State.Status";
    public const string FeedOverride = "State.FeedOverride";
    public const string ChannelState = "Channel.1.ChannelState";
    public const string JobOrders = "Production.JobOrders";
    public const string ActiveWorkMaster = "Production.ActiveWorkMaster";
    public const string ProgramExecution = "Production.ProgramExecution";
    public const string PartsProducedInLifetime = "OperationCounters.PartsProducedInLifetime";
    public const string PowerOnDuration = "OperationCounters.PowerOnDuration";
    public const string ActiveAlerts = "Notification.ActiveAlerts";
    public const string SpindleIsRotating = "Spindle.1.IsRotating";
    public const string SpindleOverride = "Spindle.1.Override";
    public const string ActivePower = "Consumption.Electricity.Main.AcActivePowerTotal";
    public const string ActiveEnergy = "Consumption.Electricity.Main.AcActiveEnergyTotalImportHp";

    public const string ProgramExecutionStarted = "Production.ProgramExecutionStarted";
    public const string ProgramExecutionInterrupted = "Production.ProgramExecutionInterrupted";
    public const string ProgramExecutionResumed = "Production.ProgramExecutionResumed";
    public const string ProgramExecutionEnded = "Production.ProgramExecutionEnded";
    public const string ProgramExecutionAborted = "Production.ProgramExecutionAborted";
    public const string JobOrderAdded = "Production.JobOrderAdded";
    public const string JobOrderReleased = "Production.JobOrderReleased";
    public const string JobOrderRevoked = "Production.JobOrderRevoked";
    public const string JobOrderStarted = "Production.JobOrderStarted";
    public const string JobOrderInterrupted = "Production.JobOrderInterrupted";
    public const string JobOrderResumed = "Production.JobOrderResumed";
    public const string JobOrderEnded = "Production.JobOrderEnded";
    public const string JobOrderAborted = "Production.JobOrderAborted";
    public const string JobOrderCancelled = "Production.JobOrderCancelled";
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
    public const string UnitDegreeCelsius = "degreeCelsius";

    /// <summary>Path of the bearing temperature of spindle 1 below the prefix of the manufacturer.</summary>
    public const string BearingTemperature = "Spindle.1.BearingTemperature";

    /// <summary>
    /// The signals of the manufacturer, in the same tree as the elements of the model. Their paths are relative to
    /// the prefix <c>x-&lt;domain&gt;</c> (<see cref="ExtensionPrefix"/>); type and unit are named in the manifest, as
    /// the rule of the model for extensions asks, and the unit follows its rules: a temperature in degrees Celsius.
    /// </summary>
    public static readonly IReadOnlyList<SpecExtension> Extensions =
    [
        new(BearingTemperature, "number", "CEL", UnitDegreeCelsius, "Temperature of the bearing of spindle 1"),
    ];

    /// <summary>The profiles the manifest declares.</summary>
    public static readonly IReadOnlyList<string> Profiles = ["Core", "Production", "Spindle", "Energy", "AlertsEvents"];

    /// <summary>Every element the virtual machine publishes, in the order of the manifest.</summary>
    public static readonly IReadOnlyList<SpecElement> Elements =
    [
        new(Manufacturer, null, "adapter", false),
        new(SerialNumber, null, "adapter", false),
        new(ProductInstanceUri, null, "adapter", false),
        new(Model, null, "adapter", false),
        new(ManufacturerUri, null, "adapter", false),
        new(ProductCode, null, "adapter", false),
        new(YearOfConstruction, null, "adapter", false),
        new(SoftwareRevision, null, "adapter", false),
        new(Heartbeat, null, "adapter", false),
        new(ConnectionState, null, "adapter", false),
        new(Status, null, "source", false),
        new(FeedOverride, UnitOne, "source", false),
        new(ChannelState, null, "source", true),
        new(JobOrders, null, "source", false),
        new(ActiveWorkMaster, null, "source", true),
        new(ProgramExecution, null, "source", false),
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
        ProgramExecutionStarted, ProgramExecutionInterrupted, ProgramExecutionResumed,
        ProgramExecutionEnded, ProgramExecutionAborted,
        JobOrderAdded, JobOrderReleased, JobOrderRevoked, JobOrderStarted, JobOrderInterrupted,
        JobOrderResumed, JobOrderEnded, JobOrderAborted, JobOrderCancelled, JobOrderChanged, JobOrderRemoved,
        AlertRaised, AlertChanged, AlertCleared,
    ];

    /// <summary>
    /// The prefix of the signals of a manufacturer: exactly one segment <c>x-&lt;domain&gt;</c>, every dot of the domain a
    /// <c>-</c>, for example <c>x-example-com</c>.
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
    /// The elements of the model a machine may lack for good: the manifest then says <c>"available": false</c>, and
    /// the value is <see langword="null"/> once and for all.
    /// </summary>
    public static readonly IReadOnlySet<string> MayBeUnavailable = new HashSet<string>(StringComparer.Ordinal)
    {
        Status, ActiveAlerts, PowerOnDuration, YearOfConstruction, SoftwareRevision,
    };

    /// <summary>The group of an event, the first segment of its path; <c>seq</c> counts within it.</summary>
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

/// <summary>A signal of the manufacturer: path below the prefix, type, unit and a description for the manifest.</summary>
internal sealed record SpecExtension(string Path, string Type, string UnitCode, string UnitName, string Description);

/// <summary>An element of the manifest.</summary>
/// <param name="Path">Path in the data model.</param>
/// <param name="Unit">Unit name sent with a numeric value, or <see langword="null"/>.</param>
/// <param name="TimestampSource">Whether the timestamp is source or adapter time.</param>
/// <param name="CorrelationId">Whether the envelope carries a correlationId while a program runs.</param>
/// <param name="Extension">For a signal of the manufacturer, what the manifest says about it.</param>
internal sealed record SpecElement(string Path, string? Unit, string TimestampSource, bool CorrelationId, SpecExtension? Extension = null);
