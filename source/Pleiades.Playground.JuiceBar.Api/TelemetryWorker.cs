using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// The state of the machine as values of the MQTT binding, below <c>machines/{MachineId}/</c>: the snapshot
/// <c>State.Status</c> of the data model below <c>umati/</c>, and the values of the machine itself, which the model
/// does not know, as signals of the manufacturer below the prefix <c>x-&lt;domain&gt;</c>, which the binding maps to
/// <c>oem/</c>. Their paths begin with <c>JuiceBar</c>, as the topics did before the payloads followed the binding.
/// </summary>
internal static partial class TelemetryMapper
{
    /// <summary>The first segment of every signal below the prefix of the manufacturer.</summary>
    internal const string Root = "JuiceBar";

    /// <summary>
    /// The machine has no operation modes of the model: <c>None</c>, which OPC 40001 gives for "no operation mode
    /// available". The schema of the snapshot asks for both fields.
    /// </summary>
    internal const string NoOperationMode = "None";

    /// <summary>The signals every juice bar has; a pump adds one of its own once the machine reports it.</summary>
    internal static readonly IReadOnlyList<string> Signals =
        [Root + ".Production.State", Root + ".PumpControl.Mode", Root + ".Production.QueueLength", Root + ".Production.Progress"];

    /// <summary>
    /// The whole of what a machine that answers says now; a value it does not give is left out. A machine that does
    /// not answer says nothing: the adapter reports <c>CommunicationFault</c>, and the values stand.
    /// </summary>
    internal static IReadOnlyList<MachineValue> Map(LiveSnapshot snapshot, DateTimeOffset observedAt, MachineIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentNullException.ThrowIfNull(identity);
        var values = new List<MachineValue>();
        if (snapshot.ProductionState is { } state)
        {
            values.Add(new(identity.Signal(Root + ".Production.State"), JsonValue.Create(state), observedAt));
        }

        // The snapshot of the model; null while the machine has not said its state.
        values.Add(new(MachineManifest.Status, snapshot.ProductionState is { } production
            ? new JsonObject
            {
                ["MachineryItemState"] = production == "processingOrder" ? "Executing" : "NotExecuting",
                ["MachineryOperationMode"] = NoOperationMode,
            }
            : null, observedAt));

        if (snapshot.PumpControlMode is { } mode)
        {
            values.Add(new(identity.Signal(Root + ".PumpControl.Mode"), JsonValue.Create(mode), observedAt));
        }

        values.Add(new(identity.Signal(Root + ".Production.QueueLength"), JsonValue.Create(snapshot.Queue.Count), observedAt, MachineUnit.One.Name));
        if (snapshot.ProgressFraction is { } progress)
        {
            values.Add(new(identity.Signal(Root + ".Production.Progress"), JsonValue.Create(progress), observedAt, MachineUnit.One.Name));
        }

        foreach (var (pump, warning) in snapshot.AmountWarnings.OrderBy(w => w.Key))
        {
            values.Add(new(identity.Signal(PumpWarning(pump)), JsonValue.Create(warning), observedAt));
        }

        return values;
    }

    /// <summary>The path below the prefix of the warning of a pump.</summary>
    internal static string PumpWarning(int pump) => Root + ".Pump." + pump.ToString(CultureInfo.InvariantCulture) + ".AmountWarning";

    /// <summary>What the manifest says about a signal below the prefix: type, unit and description.</summary>
    /// <exception cref="ArgumentException">The path is no signal of this adapter.</exception>
    internal static MachineSignal Describe(string relative)
    {
        ArgumentNullException.ThrowIfNull(relative);
        if (PumpPath().Match(relative) is { Success: true } pump)
        {
            return MachineSignal.Flag($"Whether the bottle of pump {pump.Groups[1].Value} runs low");
        }
        return relative switch
        {
            Root + ".Production.State" => MachineSignal.Text("State of the production as the machine says it, for example waitingOrder or processingOrder"),
            Root + ".PumpControl.Mode" => MachineSignal.Text("Mode of the pump control as the machine says it"),
            Root + ".Production.QueueLength" => MachineSignal.WholeNumber(MachineUnit.One, "Orders waiting at the machine"),
            Root + ".Production.Progress" => MachineSignal.Number(MachineUnit.One, "Progress of the drink being mixed, as a fraction"),
            _ => throw new ArgumentException($"'{relative}' is no signal of the juice bar.", nameof(relative)),
        };
    }

    /// <summary>
    /// The manifest: the profile Core with the snapshot <c>State.Status</c>, and every signal of
    /// <paramref name="signals"/> (paths below the prefix).
    /// </summary>
    internal static JsonObject Manifest(MachineIdentity identity, TimeSpan heartbeatInterval, IEnumerable<string> signals)
    {
        ArgumentNullException.ThrowIfNull(identity);
        IEnumerable<MachineElement> elements =
        [
            new(MachineManifest.Status),
            .. signals.Select(relative => new MachineElement(identity.Signal(relative), MachineElement.Adapter, Describe(relative))),
        ];
        return MachineManifest.Build(identity, heartbeatInterval, elements);
    }

    [GeneratedRegex(@"^JuiceBar\.Pump\.([0-9]+)\.AmountWarning$")]
    private static partial Regex PumpPath();
}

/// <summary>
/// Publishes the state of the machine as the MQTT binding of machines says (<see cref="MachinePublisher"/>):
/// retained, QoS 1, the manifest before the values, <c>Connection/State</c> as the state of the adapter
/// (<c>CommunicationFault</c> while the machine does not answer), a value when it changes, and a heartbeat of its own
/// every ten seconds. Runs only when a broker is configured.
/// </summary>
internal sealed class TelemetryWorker(IManagedMqttClient mqtt, LiveState live, IOptions<JuiceBarOptions> options,
    TimeProvider time, ILogger<TelemetryWorker> logger) : BackgroundService
{
    /// <summary>How often the heartbeat comes; the manifest names it.</summary>
    internal static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(10);

    /// <summary>How often the state of the machine is looked at; a value goes out only when it changed.</summary>
    internal static readonly TimeSpan Tick = TimeSpan.FromSeconds(1);

    private readonly SortedSet<string> _signals = new(TelemetryMapper.Signals, StringComparer.Ordinal);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var identity = options.Value.Identity;
        using var publisher = new MachinePublisher(mqtt, identity, TelemetryMapper.Manifest(identity, HeartbeatInterval, _signals), time, logger);
        await publisher.AttachAsync().ConfigureAwait(false);
        using var timer = new PeriodicTimer(Tick, time);
        var lastHeartbeat = DateTimeOffset.MinValue;
        try
        {
            do
            {
                var now = time.GetUtcNow();
                if (now - lastHeartbeat >= HeartbeatInterval)
                {
                    await publisher.HeartbeatAsync(now).ConfigureAwait(false);
                    lastHeartbeat = now;
                }

                await PublishAsync(publisher, identity, live.Snapshot(), now).ConfigureAwait(false);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Stopping.
        }
        finally
        {
            await publisher.ShutdownAsync(time.GetUtcNow(), TimeSpan.FromSeconds(5)).ConfigureAwait(false);
        }
    }

    /// <summary>One look at the machine: its values while it answers, <c>CommunicationFault</c> while it does not.</summary>
    internal async Task PublishAsync(MachinePublisher publisher, MachineIdentity identity, LiveSnapshot snapshot, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(publisher);
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(snapshot);
        if (!snapshot.Connected)
        {
            await publisher.LostAsync(now).ConfigureAwait(false);
            return;
        }

        var values = TelemetryMapper.Map(snapshot, now, identity);
        // A pump the manifest does not name yet: the manifest grows before its value goes out.
        var before = _signals.Count;
        _signals.UnionWith(snapshot.AmountWarnings.Keys.Select(TelemetryMapper.PumpWarning));
        if (_signals.Count != before)
        {
            await publisher.UpdateManifestAsync(TelemetryMapper.Manifest(identity, HeartbeatInterval, _signals)).ConfigureAwait(false);
        }

        await publisher.ReachedAsync(values, now).ConfigureAwait(false);
    }
}
