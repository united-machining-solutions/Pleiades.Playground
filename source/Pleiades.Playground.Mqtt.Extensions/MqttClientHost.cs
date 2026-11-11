using System.Collections.Immutable;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

internal class MqttClientHost: IHostedService
{
    private static readonly Action<ILogger, string, Exception?> _logMqttClientStart =
    LoggerMessage.Define<string>(
        LogLevel.Information,
        new EventId(1, "MqttClientStart"),
        "Mqtt client '{ClientName}' start");

    private static readonly Action<ILogger, string, Exception?> _logMqttClientStop =
    LoggerMessage.Define<string>(
        LogLevel.Information,
        new EventId(2, "MqttClientStop"),
        "Mqtt client '{ClientName}' stop");

    private static readonly Action<ILogger, string, Exception?> _logMqttClientConnected =
    LoggerMessage.Define<string>(
        LogLevel.Information,
        new EventId(3, "MqttClientConnected"),
        "Mqtt client '{ClientName}' connected");

    private static readonly Action<ILogger, string, MqttClientDisconnectReason, string?, bool, Exception?> _logMqttClientDisconnected =
    LoggerMessage.Define<string, MqttClientDisconnectReason, string?, bool>(
        LogLevel.Information,
        new EventId(4, "MqttClientDisconnected"),
        "Mqtt client '{ClientName}' disconnected (Reason={Reason}, ReasonString={ReasonString}, ClientWasConnected={ClientWasConnected})");

    private static readonly Action<ILogger, string, Exception?> _logMqttClientConnectingFailed =
    LoggerMessage.Define<string>(
        LogLevel.Warning,
        new EventId(5, "MqttClientConnectingFailed"),
        "Mqtt client '{ClientName}' connecting failed");

    private static readonly Action<ILogger, string, long, string, Exception?> _logMqttClientMessagesSkipped =
    LoggerMessage.Define<string, long, string>(
        LogLevel.Warning,
        new EventId(8, "MqttClientMessagesSkipped"),
        "Mqtt client '{ClientName}' dropped {Count} queued messages (last topic '{Topic}'), MaxPendingMessages reached");

    private readonly IImmutableDictionary<string, IManagedMqttClient> _clients;
    private readonly IOptionsMonitor<MqttConfig> _configOptions;
    private readonly ILogger _logger;
    private readonly Dictionary<string, EventHandlers> _eventHandlers = [];
    private readonly Dictionary<string, ConnectionWatchdog> _watchdogs = [];

    public MqttClientHost(IImmutableDictionary<string, IManagedMqttClient> clients, IOptionsMonitor<MqttConfig> configOptions, ILogger<MqttClientHost> logger)
    {
        _clients = clients;
        _configOptions = configOptions;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        return Task.WhenAll(
            _clients.Select(client =>
            {
                _logMqttClientStart(_logger, client.Key, null);
                AttachLifecycleHandlers(client.Key, client.Value);
                var config = _configOptions.Get(client.Key);
                var options = ManagedMqttClientOptions.From(config);
                var watchdog = new ConnectionWatchdog(client.Key, client.Value, _logger);
                _watchdogs[client.Key] = watchdog;
                return StartClientAsync(client.Value, options, watchdog);
            }));
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.WhenAll(
            _clients.Select(client =>
            {
                _logMqttClientStop(_logger, client.Key, null);
                DetachLifecycleHandlers(client.Key, client.Value);
                _watchdogs.TryGetValue(client.Key, out var watchdog);
                _watchdogs.Remove(client.Key);
                return StopClientAsync(client.Value, watchdog);
            }));
    }

    private static async Task StartClientAsync(IManagedMqttClient client, ManagedMqttClientOptions options, ConnectionWatchdog watchdog)
    {
        await client.StartAsync(options).ConfigureAwait(false);
        watchdog.Start();
    }

    private static async Task StopClientAsync(IManagedMqttClient client, ConnectionWatchdog? watchdog)
    {
        if (watchdog != null)
        {
            await watchdog.StopAsync().ConfigureAwait(false);
            watchdog.Dispose();
        }
        await client.StopAsync().ConfigureAwait(false);
    }

    private void AttachLifecycleHandlers(string name, IManagedMqttClient client)
    {
        var skippedMessages = new SkippedMessageCounter();
        Func<MqttClientConnectedEventArgs, Task> onConnected = _ =>
        {
            _logMqttClientConnected(_logger, name, null);
            LogSkipped(name, skippedMessages.Flush());
            return Task.CompletedTask;
        };
        Func<MqttClientDisconnectedEventArgs, Task> onDisconnected = args =>
        {
            _logMqttClientDisconnected(_logger, name, args.Reason, args.ReasonString, args.ClientWasConnected, args.Exception);
            return Task.CompletedTask;
        };
        Func<ConnectingFailedEventArgs, Task> onConnectingFailed = args =>
        {
            _logMqttClientConnectingFailed(_logger, name, args.Exception);
            return Task.CompletedTask;
        };
        Func<ApplicationMessageSkippedEventArgs, Task> onMessageSkipped = args =>
        {
            LogSkipped(name, skippedMessages.Register(args.ApplicationMessage.Topic));
            return Task.CompletedTask;
        };

        _eventHandlers[name] = new EventHandlers(onConnected, onDisconnected, onConnectingFailed, onMessageSkipped);
        client.ConnectedAsync += onConnected;
        client.DisconnectedAsync += onDisconnected;
        client.ConnectingFailedAsync += onConnectingFailed;
        client.ApplicationMessageSkippedAsync += onMessageSkipped;
    }

    private void LogSkipped(string name, SkippedMessages? skipped)
    {
        if (skipped is { } value)
        {
            _logMqttClientMessagesSkipped(_logger, name, value.Count, value.LastTopic, null);
        }
    }

    private void DetachLifecycleHandlers(string name, IManagedMqttClient client)
    {
        if (!_eventHandlers.TryGetValue(name, out var handlers))
        {
            return;
        }
        _eventHandlers.Remove(name);
        client.ConnectedAsync -= handlers.OnConnected;
        client.DisconnectedAsync -= handlers.OnDisconnected;
        client.ConnectingFailedAsync -= handlers.OnConnectingFailed;
        client.ApplicationMessageSkippedAsync -= handlers.OnMessageSkipped;
    }

    private sealed class EventHandlers
    {
        public EventHandlers(
            Func<MqttClientConnectedEventArgs, Task> onConnected,
            Func<MqttClientDisconnectedEventArgs, Task> onDisconnected,
            Func<ConnectingFailedEventArgs, Task> onConnectingFailed,
            Func<ApplicationMessageSkippedEventArgs, Task> onMessageSkipped)
        {
            OnConnected = onConnected;
            OnDisconnected = onDisconnected;
            OnConnectingFailed = onConnectingFailed;
            OnMessageSkipped = onMessageSkipped;
        }

        public Func<MqttClientConnectedEventArgs, Task> OnConnected { get; }
        public Func<MqttClientDisconnectedEventArgs, Task> OnDisconnected { get; }
        public Func<ConnectingFailedEventArgs, Task> OnConnectingFailed { get; }
        public Func<ApplicationMessageSkippedEventArgs, Task> OnMessageSkipped { get; }
    }
}
