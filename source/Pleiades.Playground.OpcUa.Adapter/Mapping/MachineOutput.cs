using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>
/// What the adapter puts on the broker for one machine, by the MQTT binding of machines (<c>contracts/mqtt</c>):
/// the manifest, every value in the envelope of the model, <c>Connection/State</c> and the heartbeat, and the
/// alerts as <c>Notification.ActiveAlerts</c> and as CloudEvents.
/// </summary>
internal interface IMachineOutput : IAsyncDisposable
{
    /// <summary>The machine id of every topic, or null while the machine is not identified.</summary>
    string? MachineId { get; }

    /// <summary>Connects to the broker, if the machine is identified: <c>Initializing</c>, the manifest and the values.</summary>
    Task StartAsync();

    /// <summary>The machine is identified now, by the values its server gave: connects to the broker.</summary>
    Task IdentifyAsync(IdentityRegistration identity);

    /// <summary>A new value of an element. It goes out once the machine answers (<see cref="ReachedAsync"/>).</summary>
    Task ValueAsync(ElementRegistration element, ConvertedValue value, DateTime timestamp);

    /// <summary>The machine answers: the values that changed, then <c>Running</c>.</summary>
    Task ReachedAsync();

    /// <summary>The machine does not answer: <c>CommunicationFault</c>. The values stand.</summary>
    Task LostAsync();

    /// <summary>The sign of life of the adapter for this machine.</summary>
    Task HeartbeatAsync();

    /// <summary>An alert came up or went: its event, and the list of the alerts that stand now.</summary>
    Task AlertAsync(AlertChange change, IReadOnlyList<OpenAlert> open);

    /// <summary>
    /// Whether a removal can take back what the machine left on the broker now: true while the connection to the
    /// broker stands, or when the machine has no connection because it was never identified and so published nothing.
    /// </summary>
    bool CanTakeBack { get; }

    /// <summary>
    /// Ends the output. A machine that stops says <c>Shutdown</c>; a machine that is removed takes every retained
    /// message it left on the broker back, so that nothing of it is delivered again.
    /// </summary>
    Task StopAsync(bool removed);
}

/// <summary>Makes the output of a machine.</summary>
internal interface IMachineOutputFactory
{
    /// <summary>The output of <paramref name="registration"/>, with the alerts that stood when the adapter last ran.</summary>
    IMachineOutput Create(MachineRegistration registration, IReadOnlyList<OpenAlert> open);
}

/// <summary>Makes an output with an MQTT connection of its own per machine.</summary>
internal sealed class MachineOutputFactory(IOptions<Config> config, ILoggerFactory loggerFactory, TimeProvider time) : IMachineOutputFactory
{
    /// <inheritdoc />
    public IMachineOutput Create(MachineRegistration registration, IReadOnlyList<OpenAlert> open) =>
        new MachineOutput(registration, open, config.Value, loggerFactory, time);
}

/// <summary>
/// The output of one machine. It has an MQTT connection of its own, with the client id of the service and the
/// machine id, and its own last will: the binding wants a last will per machine, and a connection has one. The
/// values, the manifest, the states and the heartbeat go out through <see cref="MachinePublisher"/>, the publisher
/// every adapter of the stack shares; the alert events through the same connection.
/// </summary>
internal sealed partial class MachineOutput : IMachineOutput
{
    /// <summary>The MQTT 5 content type of an event: a CloudEvent in structured mode.</summary>
    public const string EventContentType = "application/cloudevents+json; charset=utf-8";

    /// <summary>The <c>dataschema</c> of every event: the event schema of the model version.</summary>
    public const string EventDataSchema = $"urn:umati2:datamodel:{MachineBinding.ModelVersion}:event.schema.json";

    /// <summary>The topic of the events of the group <c>Notification</c>, below <c>events/</c>.</summary>
    public const string NotificationsTopic = "notifications";

    /// <summary>At most this many events wait for the broker or for the identity; then the oldest goes.</summary>
    private const int OutboxSize = 1000;

    private static readonly TimeSpan Drain = TimeSpan.FromSeconds(3);

    private readonly MachineRegistration _registration;
    private readonly Config _config;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger _logger;
    private readonly TimeProvider _time;
    private readonly DateTimeOffset _start;
    private readonly string _sequencePrefix;

    // One at a time: what goes to the publisher, so that a later call never sends an older state. Not disposed: a
    // value of the OPC UA subscription in flight may still wait on it; without a wait handle it holds nothing unmanaged.
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Usage", "CA2213:Disposable fields should be disposed",
        Justification = "A call in flight may still wait on the gate when the output is disposed.")]
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Lock _values = new();
    private readonly Dictionary<string, MachineValue> _current = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (string Value, DateTime At)> _status = new(StringComparer.Ordinal);
    private readonly Queue<JsonObject> _waitingEvents = new();

    private IdentityRegistration? _identity;
    private IManagedMqttClient? _client;
    private MachinePublisher? _publisher;
    private bool? _reached;
    private long _alertEvents;
    private bool _stopped;
    private readonly Func<IManagedMqttClient>? _newClient;

    /// <summary>Creates the output; nothing goes out before <see cref="StartAsync"/>.</summary>
    /// <param name="registration">The machine.</param>
    /// <param name="open">The alerts that stood when the adapter last ran.</param>
    /// <param name="config">The configuration of the adapter: the broker, the heartbeat.</param>
    /// <param name="loggerFactory">The loggers.</param>
    /// <param name="time">The clock.</param>
    /// <param name="newClient">Makes the MQTT connection of the machine; a client of MQTTnet if null.</param>
    public MachineOutput(
        MachineRegistration registration,
        IReadOnlyList<OpenAlert> open,
        Config config,
        ILoggerFactory loggerFactory,
        TimeProvider time,
        Func<IManagedMqttClient>? newClient = null)
    {
        _newClient = newClient;
        ArgumentNullException.ThrowIfNull(open);
        _registration = registration ?? throw new ArgumentNullException(nameof(registration));
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _logger = loggerFactory.CreateLogger<MachineOutput>();
        _time = time ?? throw new ArgumentNullException(nameof(time));
        _start = time.GetUtcNow();
        _sequencePrefix = _start.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        _identity = Complete(registration.Identity);
        if (registration.Alerts is not null)
        {
            _current[Topics.ActiveAlerts] = AlertList(open, _start.UtcDateTime);
        }
    }

    /// <inheritdoc />
    public string? MachineId => _identity is null ? null : MachineIdentityOf(_identity, _registration.SerialNumber).MachineId;

    /// <inheritdoc />
    public bool CanTakeBack => _client is not { } client || client.IsConnected;

    /// <summary>
    /// The identity of a machine from the values of its identification, or null without <c>ManufacturerUri</c> or
    /// <c>Model</c>: with the serial number of the registration they are the machine id. A machine without a
    /// <c>ProductInstanceUri</c> gets the one the binding forms, <c>{ManufacturerUri}/{Model}/{SerialNumber}</c>;
    /// one without a <c>Manufacturer</c> is named by the domain of its <c>ManufacturerUri</c>.
    /// </summary>
    public static IdentityRegistration? IdentityOf(Func<string, string?> valueOf, string serialNumber)
    {
        ArgumentNullException.ThrowIfNull(valueOf);
        var manufacturerUri = valueOf(MachineManifest.ManufacturerUri) ?? string.Empty;
        var model = valueOf(MachineManifest.Model) ?? string.Empty;
        var identity = new IdentityRegistration
        {
            Manufacturer = NonEmpty(valueOf(MachineManifest.Manufacturer)) ?? MachineBinding.DomainOf(manufacturerUri),
            ManufacturerUri = manufacturerUri,
            Model = model,
            ProductInstanceUri = NonEmpty(valueOf(MachineManifest.ProductInstanceUri))
                ?? new MachineIdentity(string.Empty, manufacturerUri, model, serialNumber).EffectiveProductInstanceUri,
        };
        return Complete(identity) is { } complete
            ? complete with { MachineId = MachineIdentityOf(complete, serialNumber).MachineId }
            : null;
    }

    /// <summary>The identity as the publisher of the binding takes it.</summary>
    public static MachineIdentity MachineIdentityOf(IdentityRegistration identity, string serialNumber)
    {
        ArgumentNullException.ThrowIfNull(identity);
        return new MachineIdentity(identity.Manufacturer, identity.ManufacturerUri, identity.Model, serialNumber, identity.ProductInstanceUri);
    }

    /// <summary>
    /// The prefix <c>x-&lt;domain&gt;</c> of the signals of the manufacturer. A manufacturer without a web address
    /// has the domain <c>unknown</c>, as the machine id has.
    /// </summary>
    public static string ExtensionPrefix(string manufacturerUri)
    {
        var domain = MachineBinding.DomainOf(manufacturerUri ?? string.Empty);
        return MachineBinding.ExtensionPrefix(string.IsNullOrWhiteSpace(domain) ? "unknown" : domain);
    }

    /// <summary>
    /// The manifest of a registration: the profiles it delivers whole, every element on its path of the binding,
    /// the signals of the maker with type, unit and description, and the alert events if alerts are subscribed.
    /// </summary>
    public static JsonObject Manifest(MachineRegistration registration, IdentityRegistration identity, TimeSpan heartbeatInterval)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(identity);
        var prefix = ExtensionPrefix(identity.ManufacturerUri);
        var delivered = new List<MachineElement>();
        var named = new HashSet<string>(StringComparer.Ordinal);
        foreach (var element in registration.Elements.Where(element => !IsIdentity(element)))
        {
            var path = Topics.BindingPath(element.Area, element.Path, prefix);
            if (named.Add(path))
            {
                delivered.Add(new MachineElement(path, MachineElement.Source, path.StartsWith("x-", StringComparison.Ordinal) ? Signal(element) : null));
            }
        }

        if (registration.Alerts is not null)
        {
            delivered.Add(new MachineElement(Topics.ActiveAlerts, MachineElement.Source));
        }

        var manifest = MachineManifest.Build(MachineIdentityOf(identity, registration.SerialNumber), heartbeatInterval, delivered);
        IReadOnlyList<string> profiles = registration.Profiles.Count > 0 ? registration.Profiles : [MachineManifest.CoreProfile];
        manifest["profiles"] = new JsonArray([.. profiles.Select(profile => (JsonNode)profile)]);
        if (registration.Alerts is not null)
        {
            manifest["events"] = new JsonArray(
                new JsonObject { ["path"] = "Notification.AlertRaised" },
                new JsonObject { ["path"] = "Notification.AlertCleared" });
        }

        return manifest;
    }

    /// <summary>
    /// An alert event as a CloudEvent 1.0 in structured mode: <c>source</c> the <c>ProductInstanceUri</c>,
    /// <c>type</c> the path of the event, <c>sequence</c> the start of the adapter and the count of the alert
    /// events of the machine, <c>data</c> the alert.
    /// </summary>
    public static JsonObject AlertEvent(AlertChange change, string productInstanceUri, string sequence)
    {
        ArgumentNullException.ThrowIfNull(change);
        return new JsonObject
        {
            ["specversion"] = "1.0",
            ["id"] = Guid.NewGuid().ToString(),
            ["source"] = UriReference(productInstanceUri),
            ["type"] = change.Action == AlertAction.Raised ? "Notification.AlertRaised" : "Notification.AlertCleared",
            ["time"] = MachineBinding.Timestamp(new DateTimeOffset(DateTime.SpecifyKind(change.At, DateTimeKind.Utc))),
            ["sequence"] = sequence,
            ["dataschema"] = EventDataSchema,
            ["data"] = change.Alert.ToJson(),
        };
    }

    /// <summary>The text as a valid URI reference: a character a URI may not hold, such as a space, percent-encoded.</summary>
    public static string UriReference(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        var builder = new StringBuilder(text.Length);
        foreach (var rune in text.EnumerateRunes())
        {
            var allowed = rune.Value is > 0x20 and < 0x7F && rune.Value is not ('"' or '<' or '>' or '\\' or '^' or '`' or '{' or '|' or '}');
            builder.Append(allowed ? rune.ToString() : Uri.EscapeDataString(rune.ToString()));
        }

        return builder.ToString();
    }

    /// <summary>
    /// The value of an element as the binding sends it, on its path of the binding. The two fields of the state are
    /// one snapshot, <c>State.Status</c>, built by the caller; this gives a plain value.
    /// </summary>
    public static MachineValue Value(ElementRegistration element, ConvertedValue value, DateTime timestamp, string extensionPrefix)
    {
        ArgumentNullException.ThrowIfNull(element);
        ArgumentNullException.ThrowIfNull(value);
        var path = Topics.BindingPath(element.Area, element.Path, extensionPrefix);
        var at = new DateTimeOffset(DateTime.SpecifyKind(timestamp, DateTimeKind.Utc));
        if (value.Number is { } number)
        {
            var unit = element.Area == Topics.ModelArea && CatalogueUnits.WithoutUnit.Contains(element.Path) ? null : element.Unit;
            return new MachineValue(path, JsonValue.Create(number), at, unit);
        }

        return value.Flag is { } flag
            ? new MachineValue(path, JsonValue.Create(flag), at)
            : new MachineValue(path, JsonValue.Create(value.Text ?? string.Empty), at);
    }

    /// <inheritdoc />
    public async Task StartAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            await ConnectAsync().ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task IdentifyAsync(IdentityRegistration identity)
    {
        ArgumentNullException.ThrowIfNull(identity);
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_identity is not null || Complete(identity) is not { } complete)
            {
                return;
            }

            _identity = complete;
            await ConnectAsync().ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public Task ValueAsync(ElementRegistration element, ConvertedValue value, DateTime timestamp)
    {
        ArgumentNullException.ThrowIfNull(element);
        ArgumentNullException.ThrowIfNull(value);
        if (IsIdentity(element))
        {
            // Published from the identity, the same at every connect.
            return Task.CompletedTask;
        }

        lock (_values)
        {
            if (element.Area == Topics.ModelArea && Topics.StatusFields.TryGetValue(element.Path, out var field))
            {
                _status[field] = (value.Text ?? string.Empty, timestamp);
                var snapshot = new JsonObject();
                foreach (var (name, (text, _)) in _status.OrderBy(pair => pair.Key, StringComparer.Ordinal))
                {
                    snapshot[name] = text;
                }

                var at = _status.Values.Max(part => part.At);
                _current[Topics.Status] = new MachineValue(Topics.Status, snapshot, new DateTimeOffset(DateTime.SpecifyKind(at, DateTimeKind.Utc)));
            }
            else
            {
                // The prefix of a signal of the maker needs the identity; until then the value waits under its own path.
                var prefix = _identity is { } identity ? ExtensionPrefix(identity.ManufacturerUri) : "x-unknown";
                var converted = Value(element, value, timestamp, prefix);
                _current[converted.Path] = converted;
            }
        }

        return FlushAsync();
    }

    /// <inheritdoc />
    public async Task ReachedAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            _reached = true;
            if (_publisher is not null)
            {
                await _publisher.ReachedAsync(Snapshot(), _time.GetUtcNow()).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task LostAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            _reached = false;
            if (_publisher is not null)
            {
                await _publisher.LostAsync(_time.GetUtcNow()).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task HeartbeatAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_publisher is not null)
            {
                await _publisher.HeartbeatAsync(_time.GetUtcNow()).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task AlertAsync(AlertChange change, IReadOnlyList<OpenAlert> open)
    {
        ArgumentNullException.ThrowIfNull(change);
        ArgumentNullException.ThrowIfNull(open);
        lock (_values)
        {
            _current[Topics.ActiveAlerts] = AlertList(open, change.At);
        }

        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_stopped)
            {
                return;
            }

            // The count of the group Notification: from 1 in every run of the adapter, without a gap.
            var sequence = string.Create(CultureInfo.InvariantCulture, $"{_sequencePrefix}.{++_alertEvents:D12}");
            var productInstanceUri = _identity is { } identity
                ? MachineIdentityOf(identity, _registration.SerialNumber).EffectiveProductInstanceUri
                : string.Empty;
            var cloudEvent = AlertEvent(change, productInstanceUri, sequence);
            if (_client is not null && _identity is not null)
            {
                await _client.EnqueueAsync(EventMessage(MachineId!, cloudEvent)).ConfigureAwait(false);
            }
            else
            {
                // Before the identity there is no topic and no source: the event waits, and goes out with it.
                Wait(cloudEvent);
            }

            if (_reached == true && _publisher is not null)
            {
                await _publisher.ReachedAsync(Snapshot(), _time.GetUtcNow()).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task StopAsync(bool removed)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_stopped)
            {
                return;
            }

            _stopped = true;
            if (_client is null || _publisher is null || MachineId is not { } machineId)
            {
                return;
            }

            if (removed)
            {
                // A retained message stays on the broker until it is replaced; an empty one takes it back.
                foreach (var topic in RetainedTopics(machineId))
                {
                    await _client.EnqueueAsync(new MqttApplicationMessageBuilder()
                        .WithTopic(topic)
                        .WithPayload(Array.Empty<byte>())
                        .WithRetainFlag(true)
                        .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                        .Build()).ConfigureAwait(false);
                }

                await DrainAsync().ConfigureAwait(false);
                if (_client.PendingApplicationMessagesCount > 0)
                {
                    // The broker went away during the removal: what did not go out stays retained there.
                    LogRetainedNotCleared(machineId, _client.PendingApplicationMessagesCount);
                }
                else
                {
                    LogRetainedCleared(machineId);
                }
            }
            else
            {
                await _publisher.ShutdownAsync(_time.GetUtcNow(), Drain).ConfigureAwait(false);
            }

            // A clean disconnect: the broker does not publish the last will.
            await _client.StopAsync(cleanDisconnect: true).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await StopAsync(removed: false).ConfigureAwait(false);
        _publisher?.Dispose();
        _client?.Dispose();
        _publisher = null;
        _client = null;
    }

    /// <summary>Connects to the broker once the machine is identified. Holds the gate.</summary>
    private async Task ConnectAsync()
    {
        if (_stopped || _client is not null || _identity is not { } identity)
        {
            if (_identity is null)
            {
                LogNotIdentified(_registration.SerialNumber);
            }

            return;
        }

        var machine = MachineIdentityOf(identity, _registration.SerialNumber);
        var manifest = Manifest(_registration, identity, _config.HeartbeatInterval);
        lock (_values)
        {
            // A signal of the maker that came before the identity takes its path of the binding now.
            foreach (var path in _current.Keys.Where(path => path.StartsWith("x-unknown.", StringComparison.Ordinal)).ToList())
            {
                var value = _current[path];
                _current.Remove(path);
                var moved = $"{ExtensionPrefix(identity.ManufacturerUri)}.{path["x-unknown.".Length..]}";
                _current[moved] = value with { Path = moved };
            }
        }

        var settings = _config.MqttDestination;
        var own = new MqttConfig
        {
            ConnectionString = settings.ConnectionString,
            User = settings.User,
            Password = settings.Password,
            UseTls = settings.UseTls,
            UseSecureWebSocket = settings.UseSecureWebSocket,
            ProtocolVersion = settings.ProtocolVersion,
            // One connection per machine, each with a client id of its own.
            ClientId = $"{settings.ClientId ?? "opcua-adapter"}-{machine.MachineId}",
            CleanSession = true,
            MaxPendingMessages = settings.MaxPendingMessages,
        };

#pragma warning disable CA2000 // Owned by this output and disposed in DisposeAsync.
        var client = _newClient?.Invoke() ?? new MqttClientFactory().CreateManagedMqttClient(new MqttLogger(_loggerFactory));
#pragma warning restore CA2000
        _client = client;
        _publisher = new MachinePublisher(client, machine, manifest, _time, _logger);
        await _publisher.AttachAsync().ConfigureAwait(false);
        await client.StartAsync(ManagedMqttClientOptions.From(own, builder => builder.WithMachineLastWill(machine.MachineId, _time.GetUtcNow())))
            .ConfigureAwait(false);

        while (_waitingEvents.TryDequeue(out var waiting))
        {
            waiting["source"] = UriReference(machine.EffectiveProductInstanceUri);
            await client.EnqueueAsync(EventMessage(machine.MachineId, waiting)).ConfigureAwait(false);
        }

        if (_reached == true)
        {
            await _publisher.ReachedAsync(Snapshot(), _time.GetUtcNow()).ConfigureAwait(false);
        }
        else if (_reached == false)
        {
            await _publisher.LostAsync(_time.GetUtcNow()).ConfigureAwait(false);
        }

        LogStarted(_registration.SerialNumber, machine.MachineId);
    }

    private async Task FlushAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            // Before the machine answers the values only gather; Running sends them all at once.
            if (_reached == true && _publisher is not null && !_stopped)
            {
                await _publisher.ReachedAsync(Snapshot(), _time.GetUtcNow()).ConfigureAwait(false);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private List<MachineValue> Snapshot()
    {
        lock (_values)
        {
            return [.. _current.Values];
        }
    }

    private void Wait(JsonObject cloudEvent)
    {
        // Topic and source are set when the event goes out: until then the identity is not known.
        if (_waitingEvents.Count >= OutboxSize)
        {
            _waitingEvents.Dequeue();
            LogEventDropped(_registration.SerialNumber);
        }

        _waitingEvents.Enqueue(cloudEvent);
    }

    private MqttApplicationMessage EventMessage(string machineId, JsonObject cloudEvent) =>
        new MqttApplicationMessageBuilder()
            .WithTopic($"{MachineBinding.Root}/{machineId}/events/{NotificationsTopic}")
            .WithPayload(Encoding.UTF8.GetBytes(cloudEvent.ToJsonString()))
            .WithContentType(EventContentType)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(false)
            .Build();

    /// <summary>Every retained topic of the machine, the manifest last: a consumer that still sees it knows the values.</summary>
    private IEnumerable<string> RetainedTopics(string machineId)
    {
        var paths = new HashSet<string>(StringComparer.Ordinal)
        {
            MachineBinding.ConnectionState, MachineBinding.Heartbeat,
        };
        paths.UnionWith(Topics.Identity);
        paths.UnionWith(MachineManifest.Core);
        lock (_values)
        {
            paths.UnionWith(_current.Keys);
        }

        if (_identity is { } identity)
        {
            var prefix = ExtensionPrefix(identity.ManufacturerUri);
            paths.UnionWith(_registration.Elements.Select(element => Topics.BindingPath(element.Area, element.Path, prefix)));
        }

        foreach (var path in paths.Order(StringComparer.Ordinal))
        {
            yield return MachineBinding.Topic(machineId, path);
        }

        yield return MachineBinding.ManifestTopic(machineId);
    }

    private async Task DrainAsync()
    {
        var deadline = _time.GetUtcNow() + Drain;
        while (_client is { IsConnected: true, PendingApplicationMessagesCount: > 0 } && _time.GetUtcNow() < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), _time).ConfigureAwait(false);
        }
    }

    private static MachineValue AlertList(IReadOnlyList<OpenAlert> open, DateTime at) =>
        new(Topics.ActiveAlerts, new JsonArray([.. open.Select(alert => (JsonNode)alert.ToJson())]), new DateTimeOffset(DateTime.SpecifyKind(at, DateTimeKind.Utc)));

    private static bool IsIdentity(ElementRegistration element) =>
        element.Area == Topics.ModelArea && Topics.Identity.Contains(element.Path);

    private static IdentityRegistration? Complete(IdentityRegistration? identity) =>
        identity is not null
        && !string.IsNullOrWhiteSpace(identity.ManufacturerUri)
        && !string.IsNullOrWhiteSpace(identity.Model)
        && !string.IsNullOrWhiteSpace(identity.Manufacturer)
        && !string.IsNullOrWhiteSpace(identity.ProductInstanceUri)
            ? identity
            : null;

    private static string? NonEmpty(string? text) => string.IsNullOrWhiteSpace(text) ? null : text;

    private static MachineSignal Signal(ElementRegistration element)
    {
        var description = string.IsNullOrWhiteSpace(element.Evidence) ? $"Read from the node {element.Node}." : element.Evidence;
        return element.Kind switch
        {
            ValueKind.Number when element.Unit is { } name && CatalogueUnits.Known.TryGetValue(name, out var unit) => MachineSignal.Number(unit, description),
            ValueKind.Number => new MachineSignal("number", null, null, description),
            ValueKind.Boolean => MachineSignal.Flag(description),
            _ => MachineSignal.Text(description),
        };
    }

    [LoggerMessage(EventId = 300, Level = LogLevel.Information, Message = "Machine {SerialNumber} publishes as {MachineId}, on a connection of its own")]
    private partial void LogStarted(string serialNumber, string machineId);

    [LoggerMessage(EventId = 301, Level = LogLevel.Information,
        Message = "Machine {SerialNumber} has no identity yet: it is published once its server gave ManufacturerUri and Model")]
    private partial void LogNotIdentified(string serialNumber);

    [LoggerMessage(EventId = 303, Level = LogLevel.Warning, Message = "Machine {SerialNumber}: the oldest alert event that waited for the identity is dropped")]
    private partial void LogEventDropped(string serialNumber);

    [LoggerMessage(EventId = 302, Level = LogLevel.Information, Message = "The retained messages of {MachineId} are taken back from the broker")]
    private partial void LogRetainedCleared(string machineId);

    [LoggerMessage(EventId = 304, Level = LogLevel.Warning,
        Message = "The broker went away while the retained messages of {MachineId} were taken back: {Pending} did not go out and stay retained")]
    private partial void LogRetainedNotCleared(string machineId, int pending);
}
