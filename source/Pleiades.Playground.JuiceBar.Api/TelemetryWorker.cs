using System.Globalization;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.JuiceBar.Api;

internal sealed record TelemetrySample(string Suffix, IMessage Message);

/// <summary>
/// The state of the machine as values of the MQTT binding, below <c>machines/{MachineId}/</c>: the elements of the
/// data model below <c>umati/</c>, the values of the machine itself, which the model does not know, below
/// <c>oem/JuiceBar/</c>.
/// </summary>
internal static class TelemetryMapper
{
    internal const string Oem = "oem/JuiceBar/";

    /// <summary>The adapter reaches the machine.</summary>
    internal const string Running = "Running";

    /// <summary>The adapter runs and does not reach the machine.</summary>
    internal const string CommunicationFault = "CommunicationFault";

    internal static IReadOnlyList<TelemetrySample> Map(LiveSnapshot snapshot, DateTime observedAt)
    {
        var samples = new List<TelemetrySample>
        {
            // The states of an adapter of the data model: Running while the machine answers, CommunicationFault
            // while it does not.
            new("umati/Connection/State", new StringValueDto { Timestamp = observedAt, Value = snapshot.Connected ? Running : CommunicationFault }),
        };
        if (!snapshot.Connected)
        {
            // Nothing is known about a machine that does not answer, so nothing else is said.
            return samples;
        }

        if (snapshot.ProductionState is { } state)
        {
            samples.Add(new(Oem + "Production/State", new StringValueDto { Timestamp = observedAt, Value = state }));
            // A field of the snapshot State/Status, on the topic the store keeps it on: this adapter sends no
            // snapshots yet, as the Ultimaker telemetry.
            samples.Add(new("umati/State/Status/MachineryItemState",
                new StringValueDto { Timestamp = observedAt, Value = state == "processingOrder" ? "Executing" : "NotExecuting" }));
        }

        if (snapshot.PumpControlMode is { } mode)
        {
            samples.Add(new(Oem + "PumpControl/Mode", new StringValueDto { Timestamp = observedAt, Value = mode }));
        }

        samples.Add(new(Oem + "Production/QueueLength",
            new BaseUnitValueDto { Timestamp = observedAt, Value = snapshot.Queue.Count, Unit = BaseUnit.One }));
        if (snapshot.ProgressFraction is { } progress)
        {
            samples.Add(new(Oem + "Production/Progress", new BaseUnitValueDto { Timestamp = observedAt, Value = progress, Unit = BaseUnit.One }));
        }

        foreach (var (pump, warning) in snapshot.AmountWarnings.OrderBy(w => w.Key))
        {
            samples.Add(new(Oem + "Pump/" + pump.ToString(CultureInfo.InvariantCulture) + "/AmountWarning",
                new BooleanValueDto { Timestamp = observedAt, Value = warning }));
        }

        return samples;
    }

    /// <summary>The identification values of the data model this machine has: its model and serial number, and its manufacturer where one is named.</summary>
    internal static IReadOnlyList<(string Name, string Value)> Identification(JuiceBarOptions options)
    {
        var values = new List<(string Name, string Value)>();
        if (!string.IsNullOrWhiteSpace(options.ManufacturerName))
        {
            values.Add(("Manufacturer", options.ManufacturerName));
        }

        values.Add(("Model", options.Model));
        values.Add(("SerialNumber", options.SerialNumber));
        return values;
    }
}

/// <summary>
/// Publishes the state every ten seconds, with a heartbeat of its own, the way a machine says that it is
/// there, and who the machine is every five minutes, since nothing is retained. Runs only when a broker is
/// configured.
/// </summary>
internal sealed class TelemetryWorker(IManagedMqttClient mqtt, LiveState live, IOptions<JuiceBarOptions> options,
    TimeProvider time) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var prefix = "machines/" + options.Value.MachineId + "/";
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10), time);
        long count = 0;
        try
        {
            do
            {
                if (!mqtt.IsConnected)
                {
                    continue;
                }

                var now = time.GetUtcNow().UtcDateTime;
                await mqtt.Publish(prefix + "umati/Connection/Heartbeat",
                    new BaseUnitValueDto { Timestamp = now, Value = ++count, Unit = BaseUnit.One }).ConfigureAwait(false);
                // Who the machine is, so a display can name it: at the start and then every five minutes.
                if (count % 30 == 1)
                {
                    foreach (var (name, value) in TelemetryMapper.Identification(options.Value))
                    {
                        await mqtt.Publish(prefix + "umati/Identification/" + name,
                            new StringValueDto { Timestamp = now, Value = value }).ConfigureAwait(false);
                    }
                }

                foreach (var sample in TelemetryMapper.Map(live.Snapshot(), now))
                {
                    switch (sample.Message)
                    {
                        case BaseUnitValueDto number:
                            await mqtt.Publish(prefix + sample.Suffix, number).ConfigureAwait(false);
                            break;
                        case StringValueDto text:
                            await mqtt.Publish(prefix + sample.Suffix, text).ConfigureAwait(false);
                            break;
                        case BooleanValueDto flag:
                            await mqtt.Publish(prefix + sample.Suffix, flag).ConfigureAwait(false);
                            break;
                        default:
                            break;
                    }
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Stopping.
        }
    }
}
