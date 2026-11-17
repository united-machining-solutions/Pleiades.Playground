// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Simulator.Production;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// Runs the virtual machine and hands what it says in each step to its outputs, each of them switched on its own:
/// <list type="bullet">
/// <item>the spec output (<c>Config:SpecOutput:Enabled</c>): the manifest, every value retained and the events not
/// retained, below <c>simulators/{SerialNumber}/</c>, on an MQTT connection of its own with the last will
/// <c>Connection/State = CommunicationFault</c>. A scenario may let the adapter lose the machine now and then
/// (<see cref="ScenarioConfig.CommunicationFaultInterval"/>): meanwhile only the heartbeat goes out;</item>
/// <item>the production events (<c>Config:ProductionEvents:Enabled</c>): the job order and program execution events
/// in the binding of the playground, on <c>machines/{SerialNumber}/events/jobs</c> and <c>…/events/workmasters</c>, over the connection of the
/// generators.</item>
/// </list>
/// The scenario of the virtual machine is the one of <c>Config:SpecOutput</c> in both cases.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class VirtualMachineService : BackgroundService
{
    private readonly Config _config;
    private readonly SpecOutputConfig _spec;
    private readonly ILogger<VirtualMachineService> _logger;
    private readonly IManagedMqttClient _playgroundClient;
    private readonly ILoggerFactory _loggerFactory;
    private readonly TimeProvider _timeProvider;
    private readonly Lock _lock = new();

    private VirtualMachine? _machine;
    private JsonObject _manifest = [];
    private bool _faulted;

    public VirtualMachineService(
        IOptions<Config> config,
        ILogger<VirtualMachineService> logger,
        ILoggerFactory loggerFactory,
        TimeProvider timeProvider,
        IManagedMqttClient playgroundClient)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value;
        _playgroundClient = playgroundClient;
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
        _manifest = SpecManifest.Build(identity, _spec);
        var counters = SpecCounterStore.Load(_spec.PersistenceFilePath, _spec.Scenario);
        _machine = new VirtualMachine(identity, _spec, counters, start);
        _machine.TakeInitialMessages();

        var production = _config.ProductionEvents.Enabled
            ? new ProductionEventOutput(_playgroundClient, _config.SerialNumber)
            : null;
        var faults = new CommunicationFaults(_spec.Scenario.CommunicationFaultInterval, _spec.Scenario.CommunicationFaultDuration, start);
        if (production is not null)
        {
            LogProductionEvents(_config.SerialNumber);
        }

        // The spec output has a connection of its own; client and publisher are disposed once the loop has ended
        // and the client is stopped, in the finally block below.
        IManagedMqttClient? client = null;
        SpecPublisher? publisher = null;
        var lastSaved = start;
        using var timer = new PeriodicTimer(_spec.TickInterval, _timeProvider);
        try
        {
            if (_spec.Enabled)
            {
                LogStarting(SpecWire.Root, _config.SerialNumber);
                client = new MqttClientFactory().CreateManagedMqttClientWithLogger(_loggerFactory);
                publisher = new SpecPublisher(client, _config.SerialNumber, _manifest, identity.ProductInstanceUri, _spec.EventBufferSize, _logger);
                var connected = publisher;
                // The handler only runs while the client is started; the client is stopped before either is disposed.
#pragma warning disable CA2025
                client.ConnectedAsync += _ => OnConnectedAsync(connected);
#pragma warning restore CA2025
                await client.StartAsync(CreateOptions(start)).ConfigureAwait(false);
            }

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

                if (publisher is not null)
                {
                    await PublishSpecAsync(publisher, faults.IsFaulted(now), messages, now).ConfigureAwait(false);
                }
                if (production is not null)
                {
                    await production.PublishAsync(messages).ConfigureAwait(false);
                }

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
            try
            {
                if (client is not null && publisher is not null)
                {
                    await DisconnectAsync(client, publisher).ConfigureAwait(false);
                }
            }
            finally
            {
                publisher?.Dispose();
                client?.Dispose();
            }
        }
    }

    /// <summary>
    /// Hands one step to the spec output. While the adapter cannot reach the machine it sends only its heartbeat:
    /// the values stand with their source time, and the events of the machine meanwhile are lost, a gap in
    /// <c>sequence</c>. When it reaches the machine again it sends every value and says <c>Running</c>.
    /// </summary>
    private async Task PublishSpecAsync(SpecPublisher publisher, bool faulted, IReadOnlyList<SpecMessage> messages, DateTimeOffset now)
    {
        bool changed;
        List<SpecValue> values = [];
        lock (_lock)
        {
            changed = faulted != _faulted;
            _faulted = faulted;
            if (changed && !faulted)
            {
                values = [.. _machine!.Values];
            }
        }

        if (faulted)
        {
            if (changed)
            {
                LogCommunicationFault();
                await publisher.PublishConnectionStateAsync(SpecPublisher.CommunicationFault, now).ConfigureAwait(false);
            }
            await publisher.PublishAsync([.. messages.Where(m => m is SpecValue { Path: SpecElements.Heartbeat })]).ConfigureAwait(false);
            return;
        }
        if (changed)
        {
            LogCommunicationRestored();
            if (publisher.IsConnected)
            {
                await publisher.PublishStateAsync(values, now).ConfigureAwait(false);
            }
            return;
        }
        await publisher.PublishAsync(messages).ConfigureAwait(false);
    }

    private async Task OnConnectedAsync(SpecPublisher publisher)
    {
        List<SpecValue> values;
        DateTimeOffset now;
        bool reachable;
        lock (_lock)
        {
            values = [.. _machine!.Values];
            now = _machine.Now;
            reachable = !_faulted;
        }
        await publisher.PublishStateAsync(values, now, reachable).ConfigureAwait(false);
    }

    private async Task DisconnectAsync(IManagedMqttClient client, SpecPublisher publisher)
    {
        if (client.IsConnected)
        {
            await publisher.PublishConnectionStateAsync(SpecPublisher.Shutdown, _timeProvider.GetUtcNow()).ConfigureAwait(false);
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
        // connect: the binding has no way to put the time of the break into it. The model needs no last will (the
        // heartbeat tells whether the adapter lives); here it tells sooner, with the value closest to it.
        var (willTopic, willPayload) = SpecPublisher.LastWill(_config.SerialNumber, start);
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

    [LoggerMessage(EventId = 100, Level = LogLevel.Information, Message = "Spec output publishes the virtual machine below {Root}/{SerialNumber}/")]
    private partial void LogStarting(string root, string serialNumber);

    [LoggerMessage(EventId = 101, Level = LogLevel.Information, Message = "Job and work master events of the virtual machine go to machines/{SerialNumber}/events/jobs and /workmasters")]
    private partial void LogProductionEvents(string serialNumber);

    [LoggerMessage(EventId = 102, Level = LogLevel.Information, Message = "Virtual machine is stopping")]
    private partial void LogStopping();

    [LoggerMessage(EventId = 104, Level = LogLevel.Warning, Message = "Saving the counters to {File} failed")]
    private partial void LogSaveFailed(string file, Exception exception);

    [LoggerMessage(EventId = 105, Level = LogLevel.Information, Message = "Spec output cannot reach the virtual machine (scenario): CommunicationFault")]
    private partial void LogCommunicationFault();

    [LoggerMessage(EventId = 106, Level = LogLevel.Information, Message = "Spec output reaches the virtual machine again")]
    private partial void LogCommunicationRestored();
}

/// <summary>
/// When the adapter of a scenario cannot reach the machine: at the end of every <c>interval</c> from the start,
/// for <c>duration</c>. Without an interval, never.
/// </summary>
internal sealed class CommunicationFaults(TimeSpan? interval, TimeSpan duration, DateTimeOffset start)
{
    /// <summary>Whether the adapter cannot reach the machine at <paramref name="now"/>.</summary>
    public bool IsFaulted(DateTimeOffset now)
    {
        if (interval is not { } every || every <= TimeSpan.Zero || duration <= TimeSpan.Zero || now < start)
        {
            return false;
        }
        var within = TimeSpan.FromTicks((now - start).Ticks % every.Ticks);
        return within >= every - (duration < every ? duration : every);
    }
}

/// <summary>Keeps the counters of the virtual machine in a small JSON file.</summary>
internal static class SpecCounterStore
{
    public static MachineCounters Load(string? path, ScenarioConfig scenario)
    {
        ArgumentNullException.ThrowIfNull(scenario);
        var initial = new MachineCounters(scenario.InitialPowerOnDuration, scenario.InitialEnergy, scenario.InitialPartsProduced, scenario.InitialOperationDuration);
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
