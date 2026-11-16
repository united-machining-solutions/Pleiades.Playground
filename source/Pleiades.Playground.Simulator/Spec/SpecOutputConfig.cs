// SPDX-License-Identifier: Apache-2.0
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// The output after the data model (contracts/mqtt, "Spec binding"). It runs in addition to the output of the
/// generators and is off unless <see cref="Enabled"/> is set.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class SpecOutputConfig
{
    /// <summary>Whether this simulator also publishes below <c>umati/{machineId}/</c>.</summary>
    public bool Enabled { get; init; }

    /// <summary>Name of the manufacturer, the value of <c>Identification.Manufacturer</c>.</summary>
    public string Manufacturer { get; init; } = "Example Machine Tools";

    /// <summary>
    /// Internet domain of the manufacturer, for example <c>example.com</c>. With the serial number it forms the
    /// machine id of the topics: <c>example-com_P-04</c>.
    /// </summary>
    [RegularExpression(@"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")]
    public string ManufacturerDomain { get; init; } = "example.com";

    /// <summary>
    /// Globally unique id of the machine. Empty: <c>https://{ManufacturerDomain}/{SerialNumber}</c>.
    /// </summary>
    public string? ProductInstanceUri { get; init; }

    /// <summary>Interval of <c>Connection.Heartbeat</c>; the manifest names it.</summary>
    public TimeSpan HeartbeatInterval { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>How often power, energy and power-on duration are published.</summary>
    public TimeSpan MeasurementInterval { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>Step of the virtual machine.</summary>
    public TimeSpan TickInterval { get; init; } = TimeSpan.FromSeconds(1);

    /// <summary>
    /// File that keeps the counters (power-on duration, energy, parts), so that they only grow across restarts.
    /// Empty: not kept.
    /// </summary>
    public string? PersistenceFilePath { get; init; }

    /// <summary>
    /// How many events wait at most while the broker is away. When the outbox is full the oldest event is dropped
    /// and logged; the gap stays visible in <c>seq</c>.
    /// </summary>
    [Range(1, 1_000_000)]
    public int EventBufferSize { get; init; } = 10_000;

    /// <summary>What the virtual machine does.</summary>
    [Required]
    public ScenarioConfig Scenario { get; init; } = new();
}

/// <summary>
/// The scenario of the virtual machine: which job orders it works through, how long things take and which alerts
/// come up. All durations are real time.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class ScenarioConfig
{
    /// <summary>Seed of the random numbers; empty for a different run each start.</summary>
    public int? Seed { get; init; }

    /// <summary>
    /// How long ended and aborted job orders stay in <c>Production.JobOrders</c>. The data model asks for at least
    /// 24 hours. A shorter time is allowed for a demo; the manifest then leaves out <c>jobOrderRetention</c>.
    /// </summary>
    public TimeSpan JobOrderRetention { get; init; } = TimeSpan.FromHours(24);

    /// <summary>How many job orders wait in the list besides the active one.</summary>
    [Range(1, 10)]
    public int QueuedJobOrders { get; init; } = 2;

    /// <summary>Number of the first job order; the ids are <c>{number}/01</c>, counting up.</summary>
    public int FirstJobOrderNumber { get; init; } = 4711;

    /// <summary>The jobs, worked through in turn.</summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<JobTemplate> Jobs { get; set; } = [];

    /// <summary>Setting up the machine for a job order, before its first part.</summary>
    public TimeSpan SetupTime { get; init; } = TimeSpan.FromMinutes(2);

    /// <summary>Loading the next part, between two program executions.</summary>
    public TimeSpan LoadTime { get; init; } = TimeSpan.FromSeconds(15);

    /// <summary>Waiting between two job orders.</summary>
    public TimeSpan IdleTime { get; init; } = TimeSpan.FromMinutes(1);

    /// <summary>Electric power while the machine waits, in watt.</summary>
    public double IdlePower { get; init; } = 2500;

    /// <summary>Electric power while it is set up or loaded, in watt.</summary>
    public double SetupPower { get; init; } = 3500;

    /// <summary>Random variation of the power around its level, as a fraction (0.05 = ±5 %).</summary>
    [Range(0.0, 0.5)]
    public double PowerNoise { get; init; } = 0.05;

    /// <summary>Fraction of the parts that are scrap.</summary>
    [Range(0.0, 1.0)]
    public double ScrapRate { get; init; } = 0.03;

    /// <summary>
    /// Probability that an alert of the category Failure aborts the program execution and the job order instead
    /// of interrupting them until it is cleared.
    /// </summary>
    [Range(0.0, 1.0)]
    public double AbortOnFailureProbability { get; init; } = 0.3;

    /// <summary>Values the feed override takes in turn, as fractions.</summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<double> FeedOverrideSteps { get; set; } = [];

    /// <summary>How often per hour the feed override changes.</summary>
    public double FeedOverrideChangesPerHour { get; init; } = 4;

    /// <summary>Values the spindle override takes in turn, as fractions.</summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<double> SpindleOverrideSteps { get; set; } = [];

    /// <summary>How often per hour the spindle override changes.</summary>
    public double SpindleOverrideChangesPerHour { get; init; } = 3;

    /// <summary>Alerts that come up at random.</summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<AlertTemplate> Alerts { get; set; } = [];

    /// <summary>Power-on duration at the first start, in seconds.</summary>
    public double InitialPowerOnDuration { get; init; } = 31_536_000;

    /// <summary>Electric energy at the first start, in watt hours.</summary>
    public double InitialEnergy { get; init; } = 81_234_567;

    /// <summary>Parts produced at the first start.</summary>
    public long InitialPartsProduced { get; init; } = 184_223;
}

/// <summary>A job the virtual machine works through as a job order.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class JobTemplate
{
    /// <summary>Readable name of the job order.</summary>
    public string JobName { get; init; } = "Shaft";

    /// <summary>Program that makes one part; one program execution per part.</summary>
    public string Program { get; init; } = "SHAFT.MPF";

    /// <summary>Parts to make.</summary>
    [Range(1, 100_000)]
    public int Quantity { get; init; } = 10;

    /// <summary>Time of one program execution at a feed override of 1.0.</summary>
    public TimeSpan CycleTime { get; init; } = TimeSpan.FromMinutes(1);

    /// <summary>Electric power while the program runs, in watt.</summary>
    public double ExecutingPower { get; init; } = 12_000;
}

/// <summary>An alert that comes up at random.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class AlertTemplate
{
    /// <summary>Code of the manufacturer.</summary>
    [Required]
    public string Code { get; init; } = string.Empty;

    /// <summary>English text for the operator.</summary>
    [Required]
    public string Text { get; init; } = string.Empty;

    /// <summary>Category after NAMUR NE 107: Failure, CheckFunction, OffSpec or MaintenanceRequired.</summary>
    [RegularExpression("^(Failure|CheckFunction|OffSpec|MaintenanceRequired)$")]
    public string Severity { get; init; } = "OffSpec";

    /// <summary>Urgency from 1 to 1000; empty for none.</summary>
    [Range(1, 1000)]
    public int? SeverityValue { get; init; }

    /// <summary>The component concerned; empty for none.</summary>
    public string? Source { get; init; }

    /// <summary>How often per hour the alert comes up. A Failure comes up only while a program runs.</summary>
    public double RatePerHour { get; init; } = 1;

    /// <summary>How long the alert stays.</summary>
    public TimeSpan Duration { get; init; } = TimeSpan.FromMinutes(2);

    /// <summary>After this time the alert changes its severity value; empty for never.</summary>
    public TimeSpan? ChangeAfter { get; init; }

    /// <summary>The severity value after the change.</summary>
    [Range(1, 1000)]
    public int? ChangedSeverityValue { get; init; }
}
