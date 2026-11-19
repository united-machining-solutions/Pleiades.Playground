using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Pleiades.Playground.JuiceBar.Api.Test;

/// <summary>
/// A stand-in for MixerControl on a local port: the REST routes the service reads, the route that places an
/// order, and the Socket.IO 1.x interface over WebSocket. It records every request, so a test can show what
/// the service did not call.
/// </summary>
internal sealed class FakeMixerControl : IAsyncDisposable
{
    internal const string Tropical = "8ab4c332-8b37-44f1-9645-31ce2aa204c9";
    internal const string Orange = "f6d361a9-5a6f-42ad-bff7-0913750809e4";
    private readonly WebApplication _app;
    private readonly ConcurrentDictionary<WebSocket, SemaphoreSlim> _sockets = new();
    private readonly List<int> _queue = [];
    private int _accepted;
    private readonly Lock _gate = new();

    private FakeMixerControl(WebApplication app) => _app = app;

    internal ConcurrentQueue<string> Requests { get; } = new();

    internal string ProductionState { get; set; } = "waitingOrder";

    /// <summary>
    /// How long after its answer the machine lists an order: MixerControl answers first and puts the order into
    /// the queue once it has loaded the program.
    /// </summary>
    internal TimeSpan EnqueueDelay { get; set; } = TimeSpan.FromMilliseconds(150);

    internal Uri BaseUrl { get; private set; } = null!;

    internal static async Task<FakeMixerControl> StartAsync(CancellationToken cancellationToken)
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        var fake = new FakeMixerControl(app);
        app.UseWebSockets();
        app.Use(async (context, next) =>
        {
            fake.Requests.Enqueue(context.Request.Method + " " + context.Request.Path);
            await next(context).ConfigureAwait(false);
        });
        app.MapGet("/api/drinks", (HttpRequest request) => Results.Json(new[]
        {
            new
            {
                id = Tropical,
                title = "Tropical Mix",
                description = "language=" + request.Cookies["language"],
                backgroundColor = "#FF9900",
                // The second ingredient sits on pump 2, whose bottle warns.
                components = new[] { new { id = Orange, name = "Orange Juice" }, new { id = "unknown", name = "Mystery" } },
            },
        }));
        app.MapGet("/api/drinks/{id}/image", (string id) => id == Tropical
            ? Results.Text("""<?xml version="1.0"?><svg viewBox="0 0 900 900"><g id="_22"><path d="M0 0"/></g></svg>""", "image/svg+xml")
            : Results.NotFound());
        app.MapGet("/api/admin/pumps", () => Results.Json(new[] { new { nr = 1, componentId = Orange }, new { nr = 2, componentId = "unknown" } }));
        app.MapGet("/api/admin/pumps/standardAmount", () => Results.Json(new Dictionary<string, int> { ["1"] = 1500, ["2"] = 1000 }));
        // A colour that is not #rrggbb is left out: here the display colour, so the colour stands.
        app.MapGet("/api/components", () => Results.Json(new
        {
            available = new[] { new { id = Orange, name = "Orange Juice", color = "#FF9900", displayColor = "orange;x" } },
        }));
        app.MapGet("/api/orders/{number:int}", (int number) => number == 7 || fake.Queued(number)
            ? Results.Json(new { orderNumber = number, orderName = "Tropical Mix", drinkId = Tropical })
            : Results.NotFound());
        app.MapPost("/api/orders", async (HttpContext context) =>
        {
            using var body = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted).ConfigureAwait(false);
            var drinkId = body.RootElement.GetProperty("drinkId").GetString();
            var number = fake.Accept();
            _ = fake.EnqueueLaterAsync(number);
            return Results.Json(new { orderNumber = number, orderName = "Tropical Mix", drinkId }, statusCode: StatusCodes.Status201Created);
        });
        // The public report of the marketplace stands on the same stand-in: since the start (from 2010), and the last
        // hours. An ingredient that is in no sold drink is not in it.
        app.MapGet("/api/reports/components/top", (HttpRequest request) => request.Query["from"].ToString().StartsWith("2010-", StringComparison.Ordinal)
            ? Results.Json(new object[] { new { componentname = "Orange Juice", amount = 17 }, new { componentname = "Mineral Water", amount = 15 } })
            : Results.Json(new object[] { new { componentname = "Orange Juice", amount = 2 } }));
        app.Map("/socket.io/", fake.ServeSocketAsync);
        await app.StartAsync(cancellationToken).ConfigureAwait(false);
        fake.BaseUrl = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First());
        return fake;
    }

    internal async Task BroadcastAsync(string frame)
    {
        foreach (var (socket, gate) in _sockets)
        {
            await SendAsync(socket, gate, frame).ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var socket in _sockets.Keys)
        {
            socket.Abort();
        }

        await _app.DisposeAsync().ConfigureAwait(false);
    }

    private bool Queued(int number)
    {
        lock (_gate)
        {
            return number >= 100 && number < 100 + _accepted;
        }
    }

    private int Accept()
    {
        lock (_gate)
        {
            return 100 + _accepted++;
        }
    }

    private async Task EnqueueLaterAsync(int number)
    {
        await Task.Delay(EnqueueDelay).ConfigureAwait(false);
        lock (_gate)
        {
            _queue.Add(number);
        }

        await BroadcastAsync($$"""42/production,["queue",{{QueueJson()}}]""").ConfigureAwait(false);
        await BroadcastAsync($$"""42/orders,["state",{"orderNumber":{{number}},"toState":"waitForProduction"}]""").ConfigureAwait(false);
    }

    private string QueueJson()
    {
        lock (_gate)
        {
            return JsonSerializer.Serialize(_queue.Select((number, place) =>
                new { orderNumber = number, orderName = "Tropical Mix", drinkId = Tropical, queuePlace = place }));
        }
    }

    private async Task ServeSocketAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
        using var gate = new SemaphoreSlim(1, 1);
        _sockets[socket] = gate;
        try
        {
            await SendAsync(socket, gate, """0{"sid":"fake","upgrades":[],"pingInterval":25000,"pingTimeout":60000}""").ConfigureAwait(false);
            await SendAsync(socket, gate, "40").ConfigureAwait(false);
            var buffer = new byte[4096];
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, context.RequestAborted).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                Requests.Enqueue("WS " + text);
                foreach (var answer in Answer(text))
                {
                    await SendAsync(socket, gate, answer).ConfigureAwait(false);
                }
            }
        }
        catch (Exception error) when (error is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            // The client went away.
        }
        finally
        {
            _sockets.TryRemove(socket, out _);
        }
    }

    private IEnumerable<string> Answer(string text) => text switch
    {
        "2" => ["3"],
        "40/production" or "40/orders" => [text],
        """42/production,["room","state"]""" => [$$"""42/production,["state","{{ProductionState}}"]"""],
        """42/production,["room","queue"]""" => [$$"""42/production,["queue",{{QueueJson()}}]"""],
        """42/production,["room","pumpControlMode"]""" => ["""42/production,["pumpControlMode","idle"]"""],
        """42/production,["room","pumpControlService"]""" => ["""42/production,["pumpControlServiceState","connected"]"""],
        """42/production,["room","amountWarning"]""" =>
        [
            """42/production,["amountWarning",{"pumpNr":1,"warningCleared":true}]""",
            """42/production,["amountWarning",{"pumpNr":2,"ingredient":"x","amountWarningLimit":100}]""",
        ],
        """42/orders,["room","allOrders"]""" => ["""42/orders,["state",{"orderNumber":7,"toState":"inProduction"}]""", """42/orders,["progress",{"orderNumber":7,"progress":40}]"""],
        _ => [],
    };

    private static async Task SendAsync(WebSocket socket, SemaphoreSlim gate, string text)
    {
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (socket.State == WebSocketState.Open)
            {
                await socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false);
            }
        }
        catch (Exception error) when (error is WebSocketException or ObjectDisposedException)
        {
            // The client went away.
        }
        finally
        {
            gate.Release();
        }
    }
}
