using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// Configuration of the adapter, from the section <c>Config</c>. One adapter reads one machine.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder, never constructed in code")]
internal sealed class Config
{
    /// <summary>
    /// The serial number of the machine: the machine id in every topic, <c>machines/{SerialNumber}/...</c>.
    /// Must not contain '/', '+' or '#'.
    /// </summary>
    [Required]
    [RegularExpression(@"^[^/+#\s]+$")]
    public required string SerialNumber { get; init; }

    /// <summary>The machine number of the protocol, field 1 of every request (§3).</summary>
    [Required]
    [RegularExpression("^[A-Za-z0-9]{1,10}$")]
    public string MachineNumber { get; init; } = "1";

    /// <summary>The folder with the telegram files, shared with the machine.</summary>
    [Required]
    public string ExchangeDirectory { get; init; } = "/exchange";

    /// <summary>The file the machine writes.</summary>
    [Required]
    public string MachineFileName { get; init; } = CuttingChannelOptions.DefaultMachineFileName;

    /// <summary>The file the host, this adapter, writes.</summary>
    [Required]
    public string HostFileName { get; init; } = CuttingChannelOptions.DefaultHostFileName;

    /// <summary>How often the adapter looks for telegrams of the machine.</summary>
    [Range(typeof(TimeSpan), "00:00:00.010", "00:01:00")]
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMilliseconds(250);

    /// <summary>How long the adapter waits at most for the machine to release a file.</summary>
    [Range(typeof(TimeSpan), "00:00:00.100", "00:10:00")]
    public TimeSpan LockTimeout { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>How long the adapter waits for the reply to a request.</summary>
    [Range(typeof(TimeSpan), "00:00:00.100", "00:10:00")]
    public TimeSpan ReplyTimeout { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// How often the adapter asks the machine for its time (<c>SYSTTIME</c>). Each reply is one heartbeat; the
    /// binding wants one every ten seconds.
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:01", "00:10:00")]
    public TimeSpan HeartbeatInterval { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>
    /// How long the adapter holds back <c>MaschineLaeuft</c> and <c>MaschineSteht</c>, waiting for the
    /// <c>StartNCP</c>, <c>EndeNCP</c> or <c>ResetNCP</c> they may belong to; only then is a stop a halt of
    /// the program. Zero: no hold, and each end of a program may show as a short halt.
    /// </summary>
    [Range(typeof(TimeSpan), "00:00:00", "00:00:10")]
    public TimeSpan StateHold { get; init; } = TimeSpan.FromSeconds(1);

    /// <summary>After how many unanswered requests in a row the machine counts as disconnected.</summary>
    [Range(1, 100)]
    public int MissedRepliesUntilDisconnected { get; init; } = 3;

    /// <summary>
    /// The time zone of the machine. The timestamps of the protocol carry none (§4); the adapter reads them in
    /// this zone and publishes UTC. Empty: the time zone of the adapter.
    /// </summary>
    public string MachineTimeZone { get; init; } = string.Empty;

    /// <summary>The MQTT broker the adapter publishes to.</summary>
    [Required]
    public required MqttConfig MqttDestination { get; init; }
}
