using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Exceptions;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// Pings the broker periodically and forces a reconnect when no response arrives.
/// A stalled connection (peer gone or not reading) is otherwise only detected when the OS closes the socket,
/// because regular publishes suppress the MQTT keep-alive ping.
/// </summary>
internal sealed class ConnectionWatchdog : IDisposable
{
    internal static readonly TimeSpan DefaultPingInterval = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan PingTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan DisconnectTimeout = TimeSpan.FromSeconds(5);

    private static readonly Action<ILogger, string, Exception?> _logPingFailed =
    LoggerMessage.Define<string>(
        LogLevel.Warning,
        new EventId(6, "MqttClientPingFailed"),
        "Mqtt client '{ClientName}' ping failed, forcing reconnect");

    private static readonly Action<ILogger, string, Exception?> _logForcedDisconnectFailed =
    LoggerMessage.Define<string>(
        LogLevel.Warning,
        new EventId(7, "MqttClientForcedDisconnectFailed"),
        "Mqtt client '{ClientName}' forced disconnect failed");

    private readonly string _name;
    private readonly IManagedMqttClient _client;
    private readonly ILogger _logger;
    private readonly TimeSpan _pingInterval;
    private readonly CancellationTokenSource _stopping = new();
    private Task _loop = Task.CompletedTask;

    public ConnectionWatchdog(string name, IManagedMqttClient client, ILogger logger, TimeSpan? pingInterval = null)
    {
        _name = name;
        _client = client;
        _logger = logger;
        _pingInterval = pingInterval ?? DefaultPingInterval;
    }

    public void Start()
    {
        // Not cancelable on purpose: StopAsync awaits the loop, which ends on its own once stopping is signaled.
        _loop = Task.Run(() => RunAsync(_stopping.Token), CancellationToken.None);
    }

    public async Task StopAsync()
    {
#if NET8_0_OR_GREATER
        await _stopping.CancelAsync().ConfigureAwait(false);
#else
        _stopping.Cancel();
#endif
        await _loop.ConfigureAwait(false);
    }

    public void Dispose()
    {
        _stopping.Dispose();
    }

    internal async Task CheckAsync(CancellationToken cancellationToken)
    {
        var internalClient = _client.InternalClient;
        if (!internalClient.IsConnected)
        {
            return;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(PingTimeout);
            await internalClient.PingAsync(timeout.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Watchdog is stopping.
        }
        catch (Exception exception)
        {
            // Connection was lost during the ping, the managed client reconnects on its own.
            if (!internalClient.IsConnected)
            {
                return;
            }

            _logPingFailed(_logger, _name, exception);
            await ForceDisconnectAsync(internalClient).ConfigureAwait(false);
        }
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(_pingInterval, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            await CheckAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task ForceDisconnectAsync(IMqttClient internalClient)
    {
        try
        {
            var options = new MqttClientDisconnectOptionsBuilder()
                .WithReason(MqttClientDisconnectOptionsReason.UnspecifiedError)
                .Build();
            using var timeout = new CancellationTokenSource(DisconnectTimeout);

            // Sending DISCONNECT may time out on the blocked socket; the client tears down the channel regardless.
            await internalClient.DisconnectAsync(options, timeout.Token).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is OperationCanceledException or MqttCommunicationException)
        {
            // Expected on a blocked socket, the connection is torn down anyway.
        }
        catch (Exception exception)
        {
            _logForcedDisconnectFailed(_logger, _name, exception);
        }
    }
}
