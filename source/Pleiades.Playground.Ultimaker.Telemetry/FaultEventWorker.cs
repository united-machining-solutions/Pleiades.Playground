using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>
/// Reads the newest lines of the printer log and the job history, and publishes faults and failed jobs
/// as notification events. Read only: three GET requests, no pairing.
/// </summary>
internal sealed class FaultEventWorker(IHttpClientFactory clients, IManagedMqttClient mqtt,
    IOptions<TelemetryOptions> options, ILogger<FaultEventWorker> logger) : BackgroundService
{
    private const int HistoryCount = 10;
    private readonly FaultEventTracker _tracker = new(options.Value.SerialNumber);
    private string Topic => "machines/" + options.Value.SerialNumber + "/events/notifications";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.Value.FaultPollIntervalSecond));
        var failureLogged = false;
        try
        {
            do
            {
                try
                {
                    await PollAsync(stoppingToken).ConfigureAwait(false);
                    failureLogged = false;
                }
                catch (Exception error) when (!stoppingToken.IsCancellationRequested && error is HttpRequestException
                    or JsonException or InvalidOperationException or OperationCanceledException)
                {
                    // No answer raises nothing and resets nothing; the heartbeat reports the lost connection.
                    if (failureLogged) continue;
                    // Do not log URLs or response bodies: the printer log names hosts and users.
                    logger.LogWarning("Printer fault poll failed ({ErrorType}); no notification events until it answers.", error.GetType().Name);
                    failureLogged = true;
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    internal async Task PollAsync(CancellationToken token)
    {
        // Observing consumes a change. Without a broker the change waits for the next poll.
        if (!mqtt.IsConnected) return;
        using var client = clients.CreateClient("printer");
        using var log = await ReadAsync(client, string.Create(CultureInfo.InvariantCulture,
            $"system/log?boot=0&lines={options.Value.FaultLogLines}"), token).ConfigureAwait(false);
        using var history = await ReadAsync(client, string.Create(CultureInfo.InvariantCulture,
            $"history/print_jobs?count={HistoryCount}"), token).ConfigureAwait(false);
        if (log.RootElement.ValueKind != JsonValueKind.Array) throw new JsonException("Invalid log answer.");
        if (history.RootElement.ValueKind != JsonValueKind.Array) throw new JsonException("Invalid history answer.");
        DateTimeOffset? currentStart = null;
        using (var response = await client.GetAsync(new Uri("print_job", UriKind.Relative), token).ConfigureAwait(false))
        {
            if (response.StatusCode != HttpStatusCode.NotFound)
            {
                response.EnsureSuccessStatusCode();
                using var job = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
                currentStart = Time(job.RootElement, "datetime_started");
            }
        }
        var faults = PrinterFaultLog.Parse(log.RootElement.EnumerateArray()
            .Select(line => line.ValueKind == JsonValueKind.String ? line.GetString() : null));
        var jobs = history.RootElement.EnumerateArray()
            .Where(job => job.ValueKind == JsonValueKind.Object && Text(job, "uuid") is not null)
            .Select(job => new JobOutcome(Text(job, "uuid")!, Text(job, "result"), Time(job, "datetime_started"),
                Time(job, "datetime_finished"), Time(job, "datetime_cleaned"))).ToArray();
        foreach (var notification in _tracker.Observe(faults, jobs, currentStart))
            await mqtt.Publish(Topic, notification).ConfigureAwait(false);
    }

    private static async Task<JsonDocument> ReadAsync(HttpClient client, string path, CancellationToken token)
    {
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token).ConfigureAwait(false));
    }

    private static string? Text(JsonElement item, string name)
        => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value)
            && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString() : null;

    // The printer reports UTC without an offset; an empty string means "not yet".
    private static DateTimeOffset? Time(JsonElement item, string name)
        => DateTimeOffset.TryParse(Text(item, name), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var time) ? time : null;
}
