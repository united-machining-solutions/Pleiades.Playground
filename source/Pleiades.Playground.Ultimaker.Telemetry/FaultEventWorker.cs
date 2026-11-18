// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Ultimaker.Faults;

namespace Pleiades.Playground.Ultimaker.Telemetry;

/// <summary>
/// Reads the newest lines of the printer log and the job history, and publishes faults and failed jobs as
/// alert events of the data model. Read only: three GET requests, no pairing.
/// </summary>
internal sealed class FaultEventWorker(IHttpClientFactory clients, IManagedMqttClient mqtt,
    IOptions<TelemetryOptions> options, ILogger<FaultEventWorker> logger) : BackgroundService
{
    internal const int OutboxCapacity = 1000;
    private const int HistoryCount = 10;
    private readonly FaultEventTracker _tracker = new();
    private readonly FaultEventEnvelope _envelope = new(options.Value.ProductInstanceUri, DateTimeOffset.UtcNow);
    // Events wait here, in the order they came up, while the broker is away.
    private readonly Queue<string> _outbox = new();
    private string Topic => "machines/" + options.Value.MachineId + "/events/notifications";

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
                    // No answer raises nothing and clears nothing; Connection/State reports the lost connection.
                    if (failureLogged) continue;
                    // Do not log URLs or response bodies: the printer log names hosts and users.
                    logger.LogWarning("Printer fault poll failed ({ErrorType}); no alert events until it answers.", error.GetType().Name);
                    failureLogged = true;
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    internal async Task PollAsync(CancellationToken token)
    {
        try
        {
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
            foreach (var printerEvent in _tracker.Observe(faults, jobs, currentStart))
            {
                if (_outbox.Count == OutboxCapacity)
                {
                    // The oldest goes; its count stays a gap in sequence, nothing is numbered again.
                    _outbox.Dequeue();
                    logger.LogWarning("Event outbox full ({Capacity}); dropped the oldest event, a gap in sequence.", OutboxCapacity);
                }
                _outbox.Enqueue(_envelope.Wrap(printerEvent).ToJsonString());
            }
        }
        finally
        {
            // Also after a failed poll: what waits goes out as soon as the broker is there.
            while (mqtt.IsConnected && _outbox.TryPeek(out var payload))
            {
                await mqtt.Publish(Topic, payload, FaultEventEnvelope.ContentType, MqttQualityOfServiceLevel.AtLeastOnce, false).ConfigureAwait(false);
                _outbox.Dequeue();
            }
        }
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
