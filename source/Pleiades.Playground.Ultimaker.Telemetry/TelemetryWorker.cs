using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Ultimaker.Telemetry;

internal sealed class TelemetryOptions
{
    public string PrinterBaseUrl { get; set; } = "http://ultimaker.local/";
    /// <summary>The name of the manufacturer, as <c>Identification/Manufacturer</c> says it.</summary>
    public string ManufacturerName { get; set; } = "Ultimaker";
    /// <summary>
    /// The web address of the manufacturer, <c>Identification/ManufacturerUri</c>. Its domain without the top-level
    /// domain is the first part of the machine id, and with it the prefix of the signals of the manufacturer.
    /// </summary>
    public string ManufacturerUri { get; set; } = "https://ultimaker.com";
    public string Model { get; set; } = "UM3";
    public string SerialNumber { get; set; } = "UM3-01";
    /// <summary>The globally unique id of the printer; empty for <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>.</summary>
    public string ProductInstanceUri { get; set; } = string.Empty;
    public int PollIntervalSecond { get; set; } = 2;

    /// <summary>Who the printer is, by the rules of the binding.</summary>
    public MachineIdentity Identity => new(ManufacturerName, ManufacturerUri, Model, SerialNumber, ProductInstanceUri);

    /// <summary>The machine id of the MQTT binding, <c>&lt;manufacturer&gt;_&lt;model&gt;_&lt;serial number&gt;</c>.</summary>
    public string MachineId => Identity.MachineId;
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

/// <summary>
/// Polls the printer and publishes what it says as the MQTT binding of machines says (<see cref="MachinePublisher"/>):
/// retained, QoS 1, the manifest before the values, <c>Connection/State</c> as the state of the adapter, and a
/// heartbeat of its own every ten seconds.
/// </summary>
internal sealed class TelemetryWorker(IHttpClientFactory clients, IManagedMqttClient mqtt,
    IOptions<TelemetryOptions> options, TelemetryState state, TimeProvider time, ILogger<TelemetryWorker> logger) : BackgroundService
{
    /// <summary>How often the heartbeat comes; the manifest names it.</summary>
    internal static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(10);

    private readonly SortedSet<string> _signals = new(TelemetryMapper.Signals(TelemetryMapper.DefaultExtruders), StringComparer.Ordinal);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var identity = options.Value.Identity;
        using var publisher = new MachinePublisher(mqtt, identity, TelemetryMapper.Manifest(identity, HeartbeatInterval, _signals), time, logger);
        await publisher.AttachAsync().ConfigureAwait(false);
        try { await Task.WhenAll(PollAsync(publisher, identity, stoppingToken), HeartbeatAsync(publisher, stoppingToken)).ConfigureAwait(false); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            state.Failure();
            await publisher.ShutdownAsync(time.GetUtcNow(), TimeSpan.FromSeconds(5)).ConfigureAwait(false);
        }
    }

    private async Task PollAsync(MachinePublisher publisher, MachineIdentity identity, CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.Value.PollIntervalSecond), time);
        var failureLogged = false;
        do
        {
            IReadOnlyList<MachineValue>? values = null;
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
                    values = TelemetryMapper.Map(printer.RootElement, job?.RootElement, time.GetUtcNow(), identity);
                    state.Success();
                    failureLogged = false;
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

            if (values is null)
            {
                await publisher.LostAsync(time.GetUtcNow()).ConfigureAwait(false);
                continue;
            }
            // A printer with more extruders than the manifest names: the manifest grows before their values go out.
            var prefix = identity.ExtensionPrefix + ".";
            var before = _signals.Count;
            _signals.UnionWith(values.Where(v => v.Path.StartsWith(prefix, StringComparison.Ordinal)).Select(v => v.Path[prefix.Length..]));
            if (_signals.Count != before)
            {
                await publisher.UpdateManifestAsync(TelemetryMapper.Manifest(identity, HeartbeatInterval, _signals)).ConfigureAwait(false);
            }
            await publisher.ReachedAsync(values, time.GetUtcNow()).ConfigureAwait(false);
        } while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false));
    }

    private async Task HeartbeatAsync(MachinePublisher publisher, CancellationToken token)
    {
        using var timer = new PeriodicTimer(HeartbeatInterval, time);
        do
        {
            await publisher.HeartbeatAsync(time.GetUtcNow()).ConfigureAwait(false);
        } while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false));
    }

    private static async Task<JsonDocument> ReadAsync(HttpClient client, string path, CancellationToken token)
    {
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
    }
}
