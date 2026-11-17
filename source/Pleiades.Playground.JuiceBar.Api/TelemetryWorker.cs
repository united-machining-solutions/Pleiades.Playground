using System.Globalization;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.JuiceBar.Api;

internal sealed record TelemetrySample(string Suffix, IMessage Message);

/// <summary>The state of the machine as values of the MQTT binding, below <c>machines/{SerialNumber}/</c>.</summary>
internal static class TelemetryMapper
{
    internal const string Vendor = "vendor/JuiceBar/";

    internal static IReadOnlyList<TelemetrySample> Map(LiveSnapshot snapshot, DateTime observedAt)
    {
        var samples = new List<TelemetrySample>
        {
            new("umati/Connection/State", new StringValueDto { Timestamp = observedAt, Value = snapshot.Connected ? "Connected" : "Disconnected" }),
        };
        if (!snapshot.Connected)
        {
            // Nothing is known about a machine that does not answer, so nothing else is said.
            return samples;
        }

        if (snapshot.ProductionState is { } state)
        {
            samples.Add(new(Vendor + "Production/State", new StringValueDto { Timestamp = observedAt, Value = state }));
            samples.Add(new("umati/State/MachineryItemState",
                new StringValueDto { Timestamp = observedAt, Value = state == "processingOrder" ? "Executing" : "NotExecuting" }));
        }

        if (snapshot.PumpControlMode is { } mode)
        {
            samples.Add(new(Vendor + "PumpControl/Mode", new StringValueDto { Timestamp = observedAt, Value = mode }));
        }

        samples.Add(new(Vendor + "Production/QueueLength",
            new BaseUnitValueDto { Timestamp = observedAt, Value = snapshot.Queue.Count, Unit = BaseUnit.One }));
        if (snapshot.ProgressFraction is { } progress)
        {
            samples.Add(new(Vendor + "Production/Progress", new BaseUnitValueDto { Timestamp = observedAt, Value = progress, Unit = BaseUnit.One }));
        }

        foreach (var (pump, warning) in snapshot.AmountWarnings.OrderBy(w => w.Key))
        {
            samples.Add(new(Vendor + "Pump/" + pump.ToString(CultureInfo.InvariantCulture) + "/AmountWarning",
                new BooleanValueDto { Timestamp = observedAt, Value = warning }));
        }

        return samples;
    }
}

/// <summary>
/// Publishes the state every ten seconds, with a heartbeat of its own, the way a machine says that it is
/// there. Runs only when a broker is configured.
/// </summary>
internal sealed class TelemetryWorker(IManagedMqttClient mqtt, LiveState live, IOptions<JuiceBarOptions> options,
    TimeProvider time) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var prefix = "machines/" + options.Value.SerialNumber + "/";
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
