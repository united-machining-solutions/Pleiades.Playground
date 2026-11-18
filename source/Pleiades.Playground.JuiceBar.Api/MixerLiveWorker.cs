using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// Listens to the machine. MixerControl tells its state only over Socket.IO 1.x, so this worker speaks that
/// protocol over one WebSocket: it joins the two namespaces, asks for their rooms and writes every event into
/// <see cref="LiveState"/>. Joining a room is a subscription; it changes nothing at the machine.
/// </summary>
internal sealed partial class MixerLiveWorker(IOptions<JuiceBarOptions> options, LiveState state,
    ILogger<MixerLiveWorker> logger) : BackgroundService
{
    internal const string Production = "/production";
    internal const string Orders = "/orders";
    private static readonly string[] ProductionRooms =
        ["state", "queue", "pumpControlMode", "pumpControlService", "amountWarning", "pumpControl"];

    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(5);

    // The machine pings every 25 seconds and gives up after 60; silence for longer than that is a lost connection.
    private static readonly TimeSpan Silence = TimeSpan.FromSeconds(90);

    internal static Uri SocketUri(string baseUrl)
    {
        var builder = new UriBuilder(new Uri(new Uri(baseUrl), "/socket.io/"))
        {
            Query = "EIO=3&transport=websocket",
        };
        builder.Scheme = builder.Scheme == Uri.UriSchemeHttps ? Uri.UriSchemeWss : Uri.UriSchemeWs;
        return builder.Uri;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var failureLogged = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ListenAsync(stoppingToken).ConfigureAwait(false);
                failureLogged = false;
            }
            catch (Exception error) when (!stoppingToken.IsCancellationRequested
                && error is WebSocketException or IOException or OperationCanceledException or HttpRequestException or JsonException)
            {
                if (!failureLogged)
                {
                    // The address of the machine stays out of the log.
                    LogDisconnected(error.GetType().Name);
                    failureLogged = true;
                }
            }
            finally
            {
                state.Disconnected();
            }

            try
            {
                await Task.Delay(RetryDelay, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task ListenAsync(CancellationToken stoppingToken)
    {
        using var socket = new ClientWebSocket();
        using var sendGate = new SemaphoreSlim(1, 1);
        using var connection = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        connection.CancelAfter(Silence);
        await socket.ConnectAsync(SocketUri(options.Value.BaseUrl), connection.Token).ConfigureAwait(false);

        Task? pings = null;
        try
        {
            while (await ReceiveAsync(socket, connection.Token).ConfigureAwait(false) is { } text)
            {
                connection.CancelAfter(Silence);
                if (text.StartsWith(SocketIoFrame.Open, StringComparison.Ordinal))
                {
#pragma warning disable CA2025 // The finally block below awaits the ping task before socket and gate are disposed.
                    pings ??= PingAsync(socket, sendGate, PingInterval(text), connection.Token);
#pragma warning restore CA2025
                }
                else if (text == SocketIoFrame.Connect)
                {
                    await SendAsync(socket, sendGate, SocketIoFrame.Join(Production), connection.Token).ConfigureAwait(false);
                    await SendAsync(socket, sendGate, SocketIoFrame.Join(Orders), connection.Token).ConfigureAwait(false);
                }
                else if (text.StartsWith(SocketIoFrame.Join(Production), StringComparison.Ordinal))
                {
                    foreach (var room in ProductionRooms)
                    {
                        await SendAsync(socket, sendGate, SocketIoFrame.Emit(Production, "room", room), connection.Token).ConfigureAwait(false);
                    }

                    state.Connected();
                    LogConnected();
                }
                else if (text.StartsWith(SocketIoFrame.Join(Orders), StringComparison.Ordinal))
                {
                    await SendAsync(socket, sendGate, SocketIoFrame.Emit(Orders, "room", "allOrders"), connection.Token).ConfigureAwait(false);
                }
                else if (SocketIoFrame.TryParse(text, out var frame))
                {
                    state.Apply(frame.Channel, frame.Name, frame.Value);
                }
            }
        }
        finally
        {
            await connection.CancelAsync().ConfigureAwait(false);
            if (pings is not null)
            {
                try
                {
                    await pings.ConfigureAwait(false);
                }
                catch (Exception error) when (error is OperationCanceledException or WebSocketException or ObjectDisposedException)
                {
                    // The connection is gone; the caller reports it.
                }
            }
        }
    }

    private static TimeSpan PingInterval(string open)
    {
        try
        {
            using var document = JsonDocument.Parse(open[SocketIoFrame.Open.Length..]);
            if (document.RootElement.TryGetProperty("pingInterval", out var interval) && interval.TryGetInt32(out var ms) && ms is > 0 and < 60_000)
            {
                return TimeSpan.FromMilliseconds(ms);
            }
        }
        catch (JsonException)
        {
            // Fall back to the default of Socket.IO 1.x.
        }

        return TimeSpan.FromSeconds(25);
    }

    private static async Task PingAsync(ClientWebSocket socket, SemaphoreSlim sendGate, TimeSpan interval, CancellationToken token)
    {
        using var timer = new PeriodicTimer(interval);
        while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false))
        {
            await SendAsync(socket, sendGate, SocketIoFrame.Ping, token).ConfigureAwait(false);
        }
    }

    private static async Task SendAsync(ClientWebSocket socket, SemaphoreSlim sendGate, string text, CancellationToken token)
    {
        await sendGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            await socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, token).ConfigureAwait(false);
        }
        finally
        {
            sendGate.Release();
        }
    }

    /// <summary>Reads one text message, or null when the machine closed the connection.</summary>
    private static async Task<string?> ReceiveAsync(ClientWebSocket socket, CancellationToken token)
    {
        var buffer = new byte[8192];
        using var message = new MemoryStream();
        while (true)
        {
            var result = await socket.ReceiveAsync(buffer.AsMemory(), token).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return null;
            }

            await message.WriteAsync(buffer.AsMemory(0, result.Count), token).ConfigureAwait(false);
            if (message.Length > 4 * 1024 * 1024)
            {
                throw new IOException("Message of the machine is too large.");
            }

            if (result.EndOfMessage)
            {
                return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Listening to the juice bar.")]
    private partial void LogConnected();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Connection to the juice bar lost or not possible ({ErrorType}); retrying.")]
    private partial void LogDisconnected(string errorType);
}
