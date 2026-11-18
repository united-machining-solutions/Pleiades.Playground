// SPDX-License-Identifier: Apache-2.0
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// The output after the data model (contracts/mqtt, "Machines: the binding of the data model"): the only output
/// of the simulator.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class SpecOutputConfig
{

    /// <summary>
    /// Name of the manufacturer, the value of <c>Identification.Manufacturer</c>, unless the scenario names its own.
    /// The manufacturers of the demo stack are made up, named after the Pleiades.
    /// </summary>
    public string Manufacturer { get; init; } = "Alcyone Machine Works";

    /// <summary>
    /// Internet domain of the manufacturer, for example <c>alcyone-machines.example</c>. It forms the prefix of the
    /// signals of the manufacturer in the manifest, <c>x-alcyone-machines-example</c>, and the default
    /// <see cref="ManufacturerUri"/>. A scenario with a <see cref="ScenarioConfig.ManufacturerUri"/> of its own takes the
    /// domain from it, without <c>www.</c>.
    /// </summary>
    [RegularExpression(@"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")]
    public string ManufacturerDomain { get; init; } = "alcyone-machines.example";

    /// <summary>
    /// Globally unique id of the machine. Empty: <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>, for example
    /// <c>https://www.alcyone-machines.example/AX-400/P-04</c>.
    /// </summary>
    public string? ProductInstanceUri { get; init; }

    /// <summary>Web address of the manufacturer, <c>Identification.ManufacturerUri</c>. Empty: <c>https://{ManufacturerDomain}</c>.</summary>
    public string? ManufacturerUri { get; init; }

    /// <summary>The value of <c>Identification.ManufacturerUri</c>: <see cref="ManufacturerUri"/>, or the one of the domain.</summary>
    public string EffectiveManufacturerUri => string.IsNullOrWhiteSpace(ManufacturerUri) ? $"https://{ManufacturerDomain}" : ManufacturerUri;

    /// <summary>The value of <c>Identification.ProductInstanceUri</c> of the machine with this serial number.</summary>
    public string EffectiveProductInstanceUri(string serialNumber)
    {
        return string.IsNullOrWhiteSpace(ProductInstanceUri)
            ? $"{EffectiveManufacturerUri.TrimEnd('/')}/{Uri.EscapeDataString(Scenario.Model)}/{Uri.EscapeDataString(serialNumber)}"
            : ProductInstanceUri;
    }

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

    /// <summary>What the virtual machine does, unless <see cref="ScenarioName"/> picks one of <see cref="Scenarios"/>.</summary>
    [Required]
    public ScenarioConfig Scenario { get; init; } = new();

    /// <summary>
    /// The name of the scenario in <see cref="Scenarios"/> this simulator runs; empty for <see cref="Scenario"/>. So
    /// every simulator of the same image works through jobs of its own kind of machine.
    /// </summary>
    public string? ScenarioName { get; init; }

    /// <summary>Scenarios by name, for <see cref="ScenarioName"/>.</summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public Dictionary<string, ScenarioConfig> Scenarios { get; set; } = [];

    /// <summary>
    /// This configuration with the scenario <see cref="ScenarioName"/> names as <see cref="Scenario"/>, and with the
    /// manufacturer of the scenario, if it names one.
    /// </summary>
    /// <exception cref="InvalidOperationException">No scenario has that name.</exception>
    public SpecOutputConfig Resolve()
    {
        var scenario = Scenario;
        if (!string.IsNullOrWhiteSpace(ScenarioName) && !Scenarios.TryGetValue(ScenarioName, out scenario))
        {
            throw new InvalidOperationException(
                $"Config:SpecOutput:ScenarioName '{ScenarioName}' names no scenario in Config:SpecOutput:Scenarios.");
        }
        var manufacturerUri = string.IsNullOrWhiteSpace(scenario!.ManufacturerUri) ? ManufacturerUri : scenario.ManufacturerUri;
        return new SpecOutputConfig
        {
            Manufacturer = string.IsNullOrWhiteSpace(scenario.Manufacturer) ? Manufacturer : scenario.Manufacturer,
            ManufacturerDomain = string.IsNullOrWhiteSpace(scenario.ManufacturerUri) ? ManufacturerDomain : DomainOf(scenario.ManufacturerUri),
            ProductInstanceUri = ProductInstanceUri,
            ManufacturerUri = manufacturerUri,
            HeartbeatInterval = HeartbeatInterval,
            MeasurementInterval = MeasurementInterval,
            TickInterval = TickInterval,
            PersistenceFilePath = PersistenceFilePath,
            EventBufferSize = EventBufferSize,
            Scenario = scenario,
            ScenarioName = ScenarioName,
            Scenarios = Scenarios,
        };
    }

    /// <summary>The domain of a web address, without a leading <c>www.</c>, in lower case.</summary>
    public static string DomainOf(string uri)
    {
        return Pleiades.Playground.Mqtt.Extensions.Machines.MachineBinding.DomainOf(uri);
    }
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
    /// How long ended and aborted job orders stay in <c>Production.JobOrders</c>: as long as they stand in the plan
    /// of the machine, here one shift. The model sets no least time; the manifest names this one as
    /// <c>jobOrderRetention</c>.
    /// </summary>
    public TimeSpan JobOrderRetention { get; init; } = TimeSpan.FromHours(8);

    /// <summary>Name of the manufacturer of this machine, <c>Identification.Manufacturer</c>; empty for the one of the output.</summary>
    public string? Manufacturer { get; init; }

    /// <summary>
    /// Web address of the manufacturer of this machine, <c>Identification.ManufacturerUri</c>; empty for the one of the
    /// output. Its domain names the manufacturer in the machine id and in the prefix of its signals.
    /// </summary>
    public string? ManufacturerUri { get; init; }

    /// <summary>Model of the machine, <c>Identification.Model</c>.</summary>
    public string Model { get; init; } = "GM-500";

    /// <summary>Product code of the machine, <c>Identification.ProductCode</c>.</summary>
    public string ProductCode { get; init; } = "GM-500-A";

    /// <summary>Year the machine was built, <c>Identification.YearOfConstruction</c>.</summary>
    [Range(1000, 9999)]
    public int YearOfConstruction { get; init; } = 2023;

    /// <summary>
    /// Software revision of the operator interface of the manufacturer, an entry of <c>Components.Software</c> when
    /// <see cref="Software"/> is empty. The model has no revision of the whole machine.
    /// </summary>
    public string SoftwareRevision { get; init; } = "4.95.2";

    /// <summary>Month the machine was built, <c>Identification.MonthOfConstruction</c>.</summary>
    [Range(1, 12)]
    public int MonthOfConstruction { get; init; } = 6;

    /// <summary>Day the machine first went into operation, <c>Identification.InitialOperationDate</c>.</summary>
    public DateTimeOffset InitialOperationDate { get; init; } = new(2023, 9, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>Kind of machine, <c>Identification.DeviceClass</c>.</summary>
    public string DeviceClass { get; init; } = "Machine tool";

    /// <summary>
    /// The software components of the machine, <c>Components.Software</c>, all of its manufacturer. Empty: an NC
    /// kernel and an operator interface of the manufacturer.
    /// </summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<SoftwareTemplate> Software { get; set; } = [];

    /// <summary>
    /// How long the machine warms up after its start (<c>State.IsWarmUp</c>); it starts no job order meanwhile.
    /// Zero: no warm-up.
    /// </summary>
    public TimeSpan WarmUpTime { get; init; } = TimeSpan.Zero;

    /// <summary>
    /// How often the adapter loses the machine: every this long it cannot reach it for
    /// <see cref="CommunicationFaultDuration"/>, and <c>Connection.State</c> says <c>CommunicationFault</c>. Empty
    /// (the default): never.
    /// </summary>
    public TimeSpan? CommunicationFaultInterval { get; init; }

    /// <summary>How long the adapter cannot reach the machine at each communication fault.</summary>
    public TimeSpan CommunicationFaultDuration { get; init; } = TimeSpan.FromMinutes(1);

    /// <summary>
    /// Elements of the model this machine lacks for good: any element it publishes but the five every adapter
    /// delivers (Connection.Heartbeat, Connection.State, Identification.Manufacturer, Identification.SerialNumber,
    /// Identification.ProductInstanceUri). Each is published once with <c>value: null</c> and named in the manifest
    /// with <c>"available": false</c>. Empty by default.
    /// </summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<string> Unavailable { get; set; } = [];

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

    /// <summary>
    /// How often per hour a running program stops on its own (a programmed halt, an operator who measures) and
    /// continues after <see cref="ProgramStopDuration"/>. The program execution is interrupted, the job order not.
    /// </summary>
    public double ProgramStopsPerHour { get; init; } = 2;

    /// <summary>How long a program stop lasts.</summary>
    public TimeSpan ProgramStopDuration { get; init; } = TimeSpan.FromSeconds(30);

    /// <summary>Code of the message a program stop gives, a <c>Notification.NotificationEvent</c>.</summary>
    public string ProgramStopCode { get; init; } = "M00";

    /// <summary>English text of the message a program stop gives.</summary>
    public string ProgramStopText { get; init; } = "Programmed stop, waiting for the operator";

    /// <summary>
    /// How often per hour the planner changes a waiting job order: it revokes its release, cancels it (it ends as
    /// aborted without having run), takes it back (it leaves the list) or changes the runs it plans.
    /// </summary>
    public double QueueChangesPerHour { get; init; } = 1;

    /// <summary>How long a revoked job order waits before it may be released again.</summary>
    public TimeSpan QueueHoldTime { get; init; } = TimeSpan.FromMinutes(5);

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

    /// <summary>
    /// The lamps of the stack light from <c>NumberInList</c> 0, by colour (Red, Yellow, Green, Blue, ...). Empty: red,
    /// yellow, green and blue.
    /// </summary>
    [SuppressMessage("Usage", "CA2227:Collection properties should be read only", Justification = "Configuration binding")]
    public List<string> StacklightLamps { get; set; } = [];

    /// <summary>
    /// Temperature of the spindle bearing, a signal of the manufacturer, while the spindle stands, in degrees
    /// Celsius. The bearing warms towards <see cref="BearingTemperatureRunning"/> while the spindle turns (scaled by
    /// the spindle override) and cools back while it stands.
    /// </summary>
    public double BearingTemperatureIdle { get; init; } = 25;

    /// <summary>Temperature of the spindle bearing the spindle reaches at an override of 1.0, in degrees Celsius.</summary>
    public double BearingTemperatureRunning { get; init; } = 55;

    /// <summary>How fast the bearing warms and cools: the time constant of the approach.</summary>
    public TimeSpan BearingTimeConstant { get; init; } = TimeSpan.FromMinutes(6);

    /// <summary>Power-on duration at the first start, in seconds.</summary>
    public double InitialPowerOnDuration { get; init; } = 31_536_000;

    /// <summary>Electric energy at the first start, in watt hours.</summary>
    public double InitialEnergy { get; init; } = 81_234_567;

    /// <summary>Parts produced at the first start.</summary>
    public long InitialPartsProduced { get; init; } = 184_223;

    /// <summary>Seconds the machine had been operating at the first start, a part of the power-on duration.</summary>
    public double InitialOperationDuration { get; init; } = 18_921_600;
}

/// <summary>A job the virtual machine works through as a job order.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class JobTemplate
{
    /// <summary>Readable name of the job order.</summary>
    public string JobName { get; init; } = "Shaft";

    /// <summary>
    /// Id of the work master the job order carries out, <c>Production.ActiveWorkMaster</c>. Empty: <c>WM-</c> and
    /// the name of <see cref="Program"/> without its extension.
    /// </summary>
    public string? WorkMaster { get; init; }

    /// <summary>
    /// NC program that carries out the work master and makes one part; one program execution per part. The model
    /// has no element for it; the binding sends it as a signal of the manufacturer.
    /// </summary>
    public string Program { get; init; } = "SHAFT.MPF";

    /// <summary>The id of the work master, <see cref="WorkMaster"/> or the one made from <see cref="Program"/>.</summary>
    public string WorkMasterId => string.IsNullOrWhiteSpace(WorkMaster)
        ? $"WM-{Path.GetFileNameWithoutExtension(Program).ToUpperInvariant()}"
        : WorkMaster;

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

/// <summary>A software component of the machine, an entry of <c>Components.Software</c>.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class SoftwareTemplate
{
    /// <summary>Who makes the software.</summary>
    [Required]
    public string Manufacturer { get; init; } = string.Empty;

    /// <summary>Name of the software component; with <see cref="Manufacturer"/> it names the entry.</summary>
    [Required]
    public string ComponentName { get; init; } = string.Empty;

    /// <summary>Revision of the software.</summary>
    [Required]
    public string SoftwareRevision { get; init; } = string.Empty;
}
