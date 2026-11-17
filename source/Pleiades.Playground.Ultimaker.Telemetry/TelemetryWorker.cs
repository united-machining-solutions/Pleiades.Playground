using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Ultimaker.Telemetry;

internal sealed class TelemetryOptions
{
    public string PrinterBaseUrl { get; set; } = "http://ultimaker.local/";
    /// <summary>The first part of the machine id, after the domain of the manufacturer.</summary>
    public string Manufacturer { get; set; } = "ultimaker";
    /// <summary>The name of the manufacturer, as <c>Identification/Manufacturer</c> says it.</summary>
    public string ManufacturerName { get; set; } = "Ultimaker";
    public string Model { get; set; } = "UM3";
    public string SerialNumber { get; set; } = "UM3-01";
    /// <summary>The machine id of the MQTT binding, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>.</summary>
    public string MachineId => Manufacturer + "_" + Model + "_" + SerialNumber;
    public int PollIntervalSecond { get; set; } = 2;
}

internal sealed class TelemetryState
{
    private long _lastSuccess;
    private int _connected;
    internal void Success()
    {
        Interlocked.Exchange(ref _lastSuccess, DateTime.UtcNow.Ticks);
        Volatile.Write(ref _connected, 1);
    }
    internal void Failure() => Volatile.Write(ref _connected, 0);
    internal bool IsFresh => Volatile.Read(ref _connected) == 1
        && DateTime.UtcNow.Ticks - Interlocked.Read(ref _lastSuccess) < TimeSpan.FromSeconds(30).Ticks;
}

internal sealed class TelemetryWorker(IHttpClientFactory clients, IManagedMqttClient mqtt,
    IOptions<TelemetryOptions> options, TelemetryState state, ILogger<TelemetryWorker> logger) : BackgroundService
{
    private string Prefix => "machines/" + options.Value.MachineId + "/";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.WhenAll(PollAsync(stoppingToken), HeartbeatAsync(stoppingToken)).ConfigureAwait(false); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally { state.Failure(); }
    }

    private async Task PollAsync(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.Value.PollIntervalSecond));
        var failureLogged = false;
        do
        {
            try
            {
                using var client = clients.CreateClient("printer");
                using var printer = await ReadAsync(client, "printer", token).ConfigureAwait(false);
                if (printer.RootElement.ValueKind != JsonValueKind.Object
                    || !printer.RootElement.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String)
                    throw new JsonException("Invalid printer snapshot.");
                using var jobResponse = await client.GetAsync(new Uri("print_job", UriKind.Relative), token).ConfigureAwait(false);
                JsonDocument? job = null;
                try
                {
                    if (jobResponse.StatusCode != HttpStatusCode.NotFound)
                    {
                        jobResponse.EnsureSuccessStatusCode();
                        job = JsonDocument.Parse(await jobResponse.Content.ReadAsStringAsync(token).ConfigureAwait(false));
                    }
                    var samples = TelemetryMapper.Map(printer.RootElement, job?.RootElement, DateTime.UtcNow);
                    state.Success();
                    failureLogged = false;
                    foreach (var sample in samples)
                    {
                        if (!mqtt.IsConnected) break;
                        if (sample.Message is BaseUnitValueDto number)
                            await mqtt.Publish(Prefix + sample.Suffix, number).ConfigureAwait(false);
                        else if (sample.Message is StringValueDto text)
                            await mqtt.Publish(Prefix + sample.Suffix, text).ConfigureAwait(false);
                    }
                }
                finally { job?.Dispose(); }
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException
                or JsonException or InvalidOperationException or OperationCanceledException)
            {
                state.Failure();
                if (!failureLogged)
                {
                    // Do not log URLs, response bodies, credentials or printer user/job names.
                    logger.LogWarning("Printer telemetry poll failed ({ErrorType}); source is disconnected.", error.GetType().Name);
                    failureLogged = true;
                }
            }
        } while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false));
    }

    private async Task HeartbeatAsync(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        long count = 0;
        do
        {
            if (mqtt.IsConnected)
            {
                var now = DateTime.UtcNow;
                // The states of an adapter of the data model: Running while the printer answers, CommunicationFault
                // while it does not.
                await mqtt.Publish(Prefix + "umati/Connection/State",
                    new StringValueDto { Timestamp = now, Value = state.IsFresh ? "Running" : "CommunicationFault" }).ConfigureAwait(false);
                await mqtt.Publish(Prefix + "umati/Connection/Heartbeat",
                    new BaseUnitValueDto { Timestamp = now, Value = ++count, Unit = BaseUnit.One }).ConfigureAwait(false);
                // Who the printer is, so a display can name it; again every five minutes, since nothing is retained.
                if (count % 30 == 1)
                {
                    await PublishIdentificationAsync(now).ConfigureAwait(false);
                }
            }
        } while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false));
    }

    private async Task PublishIdentificationAsync(DateTime now)
    {
        var settings = options.Value;
        foreach (var (name, value) in new[] { ("Manufacturer", settings.ManufacturerName), ("Model", settings.Model), ("SerialNumber", settings.SerialNumber) })
        {
            await mqtt.Publish(Prefix + "umati/Identification/" + name, new StringValueDto { Timestamp = now, Value = value }).ConfigureAwait(false);
        }
    }

    private static async Task<JsonDocument> ReadAsync(HttpClient client, string path, CancellationToken token)
    {
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
    }
}
