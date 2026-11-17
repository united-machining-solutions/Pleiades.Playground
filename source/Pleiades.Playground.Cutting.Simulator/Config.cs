using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Simulator;

/// <summary>
/// Configuration of the simulator, from the section <c>Config</c> (environment: <c>Config__MachineType</c> and so
/// on). One instance simulates one machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config : IValidatableObject
{
    /// <summary>
    /// The machine type: <c>Laser2D</c>, <c>Tube</c> or <c>Punch</c>. The 3D laser is not simulated.
    /// </summary>
    [Required]
    public CuttingMachineType MachineType { get; init; } = CuttingMachineType.Laser2D;

    /// <summary>
    /// The machine number every request carries in field 1, at most ten letters or digits (§3).
    /// </summary>
    [Required]
    [RegularExpression("^[A-Za-z0-9]{1,10}$")]
    public string MachineNumber { get; init; } = "1";

    /// <summary>The name the web page shows.</summary>
    public string MachineName { get; init; } = string.Empty;

    /// <summary>
    /// The serial number the web page shows: the machine id the adapter publishes under, for example
    /// <c>L-01</c>. The telegrams do not carry it. It contains no <c>/</c>, <c>+</c> or <c>#</c>; empty when unknown.
    /// </summary>
    [RegularExpression("^[^/+#]*$")]
    public string SerialNumber { get; init; } = string.Empty;

    /// <summary>The folder with the telegram files, shared with the host.</summary>
    [Required]
    public string ExchangeDirectory { get; init; } = "/exchange";

    /// <summary>The file the machine writes.</summary>
    [Required]
    public string MachineFileName { get; init; } = CuttingChannelOptions.DefaultMachineFileName;

    /// <summary>The file the host writes.</summary>
    [Required]
    public string HostFileName { get; init; } = CuttingChannelOptions.DefaultHostFileName;

    /// <summary>How often the simulator looks for a telegram of the host.</summary>
    [Range(typeof(TimeSpan), "00:00:00.010", "00:01:00")]
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMilliseconds(250);

    /// <summary>How long the simulator waits at most for the host to release a file.</summary>
    [Range(typeof(TimeSpan), "00:00:00.100", "00:10:00")]
    public TimeSpan LockTimeout { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>Start the production plan by itself whenever it holds a free order.</summary>
    public bool AutoRun { get; init; } = true;

    /// <summary>
    /// Endless mode: while the plan runs and holds no free order, the machine writes a new one into it; and when it
    /// waits for material or for a full stack, it fills or empties the stack after <see cref="EndlessRestockAfter"/>,
    /// as an operator would. The web page switches it, and the setting survives a restart.
    /// </summary>
    public bool EndlessMode { get; init; }

    /// <summary>How long the machine waits in endless mode before it fills or empties a stack, in simulated time.</summary>
    [Range(typeof(TimeSpan), "00:00:00", "01:00:00")]
    public TimeSpan EndlessRestockAfter { get; init; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Real time per simulated time: 1 runs in real time, 0.1 ten times faster. The runtimes in the
    /// telegrams stay simulated seconds.
    /// </summary>
    [Range(0.001, 100)]
    public double TimeScale { get; init; } = 1;

    /// <summary>The shortest runtime of one NC program, in simulated time.</summary>
    public TimeSpan MinProgramDuration { get; init; } = TimeSpan.FromSeconds(20);

    /// <summary>The longest runtime of one NC program, in simulated time.</summary>
    public TimeSpan MaxProgramDuration { get; init; } = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Send <c>MaschineLaeuft</c> before <c>StartNCP</c> and <c>MaschineSteht</c> before <c>EndeNCP</c>.
    /// The specification sets no order (§5.8, §5.9); a host may expect the state first. False: the program
    /// notification first.
    /// </summary>
    public bool StateBeforeProgram { get; init; }

    /// <summary>The return value of <c>SPLITPRG</c>; the simulator does not read complete files.</summary>
    public int SplitProgramReturnCode { get; init; }

    /// <summary>The production plan type the reply to <c>MACHINFO</c> gives (§4.6 does not list values).</summary>
    public string ProductionPlanType { get; init; } = "0";

    /// <summary>Where the simulator keeps the plan and the stock across restarts. Empty: nowhere.</summary>
    public string StatePath { get; init; } = "/data/state.json";

    /// <summary>Fill an empty plan with a few demo orders on the first start.</summary>
    public bool SeedDemoOrders { get; init; } = true;

    /// <summary>The name to show: <see cref="MachineName"/> or the type and number.</summary>
    public string DisplayName => string.IsNullOrWhiteSpace(MachineName)
        ? $"{MachineType.DisplayName()} {MachineNumber}"
        : MachineName;

    /// <inheritdoc />
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (MachineType is not (CuttingMachineType.Laser2D or CuttingMachineType.Tube or CuttingMachineType.Punch))
        {
            yield return new ValidationResult(
                "MachineType must be Laser2D, Tube or Punch.", [nameof(MachineType)]);
        }

        if (MinProgramDuration <= TimeSpan.Zero || MaxProgramDuration < MinProgramDuration)
        {
            yield return new ValidationResult(
                "MinProgramDuration must be positive and not above MaxProgramDuration.",
                [nameof(MinProgramDuration), nameof(MaxProgramDuration)]);
        }
    }
}
