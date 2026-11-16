// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// Publishes the virtual machine after the spec binding of contracts/mqtt: the manifest, every value retained and
/// the events not retained, below <c>umati/{machineId}/</c>. It has its own MQTT connection, with the last will
/// <c>Connection/State = Disconnected</c>, beside the connection of the generators.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class SpecOutputService : BackgroundService
{
    private readonly Config _config;
    private readonly SpecOutputConfig _spec;
    private readonly ILogger<SpecOutputService> _logger;
    private readonly ILoggerFactory _loggerFactory;
    private readonly TimeProvider _timeProvider;
    private readonly Lock _lock = new();

    private VirtualMachine? _machine;
    private string _machineId = string.Empty;
    private JsonObject _manifest = [];

    public SpecOutputService(IOptions<Config> config, ILogger<SpecOutputService> logger, ILoggerFactory loggerFactory, TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value;
        _spec = _config.SpecOutput.Resolve();
        _logger = logger;
        _loggerFactory = loggerFactory;
        _timeProvider = timeProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var start = _timeProvider.GetUtcNow();
        var identity = new MachineIdentity(
            _spec.Manufacturer,
            _config.SerialNumber,
            string.IsNullOrWhiteSpace(_spec.ProductInstanceUri)
                ? $"https://{_spec.ManufacturerDomain}/{_config.SerialNumber}"
                : _spec.ProductInstanceUri);
        _machineId = SpecWire.MachineId(_spec.ManufacturerDomain, _config.SerialNumber);
        _manifest = SpecManifest.Build(identity, _spec);
        var counters = SpecCounterStore.Load(_spec.PersistenceFilePath, _spec.Scenario);
        _machine = new VirtualMachine(identity, _spec, counters, start);
        _machine.TakeInitialMessages();
        if (_spec.Scenario.JobOrderRetention.TotalSeconds < SpecManifest.MinimumJobOrderRetention)
        {
            LogShortRetention(_spec.Scenario.JobOrderRetention);
        }
        LogStarting(SpecWire.Root, _machineId);

        // Both are disposed once the loop has ended and the client is stopped, in the finally block below.
#pragma warning disable CA2025
        using var client = new MqttClientFactory().CreateManagedMqttClientWithLogger(_loggerFactory);
        using var publisher = new SpecPublisher(client, _machineId, _manifest, _machine.SeqEpoch, _spec.EventBufferSize, _logger);
        client.ConnectedAsync += _ => OnConnectedAsync(publisher);
#pragma warning restore CA2025
        await client.StartAsync(CreateOptions(start)).ConfigureAwait(false);

        var lastSaved = start;
        using var timer = new PeriodicTimer(_spec.TickInterval, _timeProvider);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                var now = _timeProvider.GetUtcNow();
                IReadOnlyList<SpecMessage> messages;
                MachineCounters current;
                lock (_lock)
                {
                    messages = _machine.Advance(now);
                    current = _machine.Counters;
                }

                await publisher.PublishAsync(messages).ConfigureAwait(false);

                if (now - lastSaved >= TimeSpan.FromSeconds(30))
                {
                    SaveCounters(current);
                    lastSaved = now;
                }
            }
        }
        catch (OperationCanceledException)
        {
            LogStopping();
        }
        finally
        {
            SaveCounters(_machine.Counters);
            await DisconnectAsync(client, publisher).ConfigureAwait(false);
        }
    }

    private async Task OnConnectedAsync(SpecPublisher publisher)
    {
        List<SpecValue> values;
        DateTimeOffset now;
        lock (_lock)
        {
            values = [.. _machine!.Values];
            now = _machine.Now;
        }
        await publisher.PublishStateAsync(values, now).ConfigureAwait(false);
    }

    private async Task DisconnectAsync(IManagedMqttClient client, SpecPublisher publisher)
    {
        if (client.IsConnected)
        {
            await publisher.PublishConnectionStateAsync("Disconnected", _timeProvider.GetUtcNow()).ConfigureAwait(false);
            var deadline = _timeProvider.GetUtcNow() + TimeSpan.FromSeconds(5);
            while (client.PendingApplicationMessagesCount > 0 && _timeProvider.GetUtcNow() < deadline)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(100)).ConfigureAwait(false);
            }
        }
        await client.StopAsync().ConfigureAwait(false);
    }

    private ManagedMqttClientOptions CreateOptions(DateTimeOffset start)
    {
        var destination = _config.MqttDestination;
        var mqtt = new MqttConfig
        {
            ConnectionString = destination.ConnectionString,
            User = destination.User,
            Password = destination.Password,
            UseTls = destination.UseTls,
            UseSecureWebSocket = destination.UseSecureWebSocket,
            ProtocolVersion = destination.ProtocolVersion,
            ClientId = string.IsNullOrWhiteSpace(destination.ClientId) ? null : $"{destination.ClientId}-spec",
        };

        // The broker publishes the last will when the connection breaks off. Its timestamp is the time of the
        // connect: the binding has no way to put the time of the break into it.
        var (willTopic, willPayload) = SpecPublisher.LastWill(_machineId, start);
        var options = new MqttClientOptionsBuilder()
            .WithConfig(mqtt)
            .WithWillTopic(willTopic)
            .WithWillPayload(willPayload)
            .WithWillRetain(true)
            .WithWillQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithWillContentType(SpecWire.ContentType)
            .Build();

        return new ManagedMqttClientOptions
        {
            ClientOptions = options,
            AutoReconnectDelay = TimeSpan.FromSeconds(10),
        };
    }

    private void SaveCounters(MachineCounters counters)
    {
        try
        {
            SpecCounterStore.Save(_spec.PersistenceFilePath, counters);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            LogSaveFailed(_spec.PersistenceFilePath ?? string.Empty, exception);
        }
    }

    [LoggerMessage(EventId = 100, Level = LogLevel.Information, Message = "Spec output publishes the virtual machine below {Root}/{MachineId}/")]
    private partial void LogStarting(string root, string machineId);

    [LoggerMessage(EventId = 102, Level = LogLevel.Information, Message = "Spec output is stopping")]
    private partial void LogStopping();

    [LoggerMessage(EventId = 103, Level = LogLevel.Warning,
        Message = "Job orders stay {Retention} in the list, less than the 24 hours of the data model; the manifest leaves out jobOrderRetention")]
    private partial void LogShortRetention(TimeSpan retention);

    [LoggerMessage(EventId = 104, Level = LogLevel.Warning, Message = "Saving the counters to {File} failed")]
    private partial void LogSaveFailed(string file, Exception exception);
}

/// <summary>Keeps the counters of the virtual machine in a small JSON file.</summary>
internal static class SpecCounterStore
{
    public static MachineCounters Load(string? path, ScenarioConfig scenario)
    {
        ArgumentNullException.ThrowIfNull(scenario);
        var initial = new MachineCounters(scenario.InitialPowerOnDuration, scenario.InitialEnergy, scenario.InitialPartsProduced);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return initial;
        }
        try
        {
            return JsonSerializer.Deserialize<MachineCounters>(File.ReadAllText(path)) ?? initial;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return initial;
        }
    }

    public static void Save(string? path, MachineCounters counters)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        File.WriteAllText(path, JsonSerializer.Serialize(counters));
    }
}
