using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>One element of a running machine: what was last read and what was made of it.</summary>
/// <param name="Area"><c>umati</c> or <c>vendor</c>.</param>
/// <param name="Path">The path of the element.</param>
/// <param name="Topic">The topic it is published on.</param>
/// <param name="Node">The node it comes from.</param>
/// <param name="Status"><c>Good</c>, <c>Pending</c>, or what is wrong with the node or its value.</param>
/// <param name="Raw">The value of the node as text.</param>
/// <param name="Value">The published value.</param>
/// <param name="Unit">The unit of a number.</param>
/// <param name="Timestamp">When the value was observed at the source.</param>
internal sealed record ElementStatus(
    string Area, string Path, string Topic, string Node, string Status, string? Raw, object? Value, string? Unit, DateTime? Timestamp);

/// <summary>What a machine does right now, as the adapter sees it.</summary>
/// <param name="State"><c>Connecting</c>, <c>Connected</c> or <c>Disconnected</c>.</param>
/// <param name="LastError">Why the last connect failed or the connection was lost.</param>
/// <param name="ConnectedSince">Since when the session stands.</param>
/// <param name="NeedsRescan">A node of the registration is gone: the server changed, scan it again.</param>
/// <param name="Elements">Every element with its last value.</param>
/// <param name="OpenAlerts">The alarms that stand.</param>
internal sealed record MachineStatus(
    string State,
    string? LastError,
    DateTime? ConnectedSince,
    bool NeedsRescan,
    IReadOnlyList<ElementStatus> Elements,
    IReadOnlyList<OpenAlert> OpenAlerts);

/// <summary>
/// Runs one registered machine on the session of its endpoint: subscribes to the nodes of the
/// registration and publishes what they report. The session belongs to <see cref="SharedSession"/>,
/// which several machines behind one aggregation server share. A machine needs nothing but the
/// registration, so it starts the same way after every restart.
/// </summary>
internal sealed class MachineConnection : ISessionTenant
{
    private const string Pending = "Pending";
    private const string Good = "Good";

    private readonly IMachinePublisher _publisher;
    private readonly AlertStore _alertStore;
    private readonly TimeSpan _heartbeatInterval;
    private readonly TimeSpan _samplingInterval;
    private readonly ILogger _logger;
    private readonly Lock _gate = new();
    private readonly ElementRuntime[] _elements;
    private readonly AlertTracker _alerts;
    private readonly IReadOnlySet<string> _namespaces;

    private string _state = "Disconnected";
    private string? _lastError;
    private DateTime? _connectedSince;
    private Subscription? _subscription;

    /// <summary>Creates the connection. Nothing happens before <see cref="RunAsync"/> and a session.</summary>
    public MachineConnection(
        MachineRegistration registration,
        IMachinePublisher publisher,
        AlertStore alertStore,
        TimeSpan heartbeatInterval,
        TimeSpan samplingInterval,
        ILogger logger)
    {
        Registration = registration ?? throw new ArgumentNullException(nameof(registration));
        _publisher = publisher ?? throw new ArgumentNullException(nameof(publisher));
        _alertStore = alertStore ?? throw new ArgumentNullException(nameof(alertStore));
        _heartbeatInterval = heartbeatInterval;
        _samplingInterval = samplingInterval;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _elements = [.. registration.Elements.Select(element => new ElementRuntime(element, Topics.Value(registration.SerialNumber, element.Area, element.Path)))];
        _alerts = new AlertTracker(alertStore.Load(registration.SerialNumber));
        _namespaces = MachineNamespaces.Of(registration);
    }

    /// <summary>The registration this connection runs.</summary>
    public MachineRegistration Registration { get; }

    /// <inheritdoc />
    public string Name => Registration.SerialNumber;

    /// <inheritdoc />
    public EndpointRegistration Endpoint => Registration.Endpoint;

    /// <summary>What the machine does right now.</summary>
    public MachineStatus Status
    {
        get
        {
            lock (_gate)
            {
                return new MachineStatus(
                    _state,
                    _lastError,
                    _connectedSince,
                    _elements.Any(element => element.Status is not (Good or Pending or "NotConvertible")),
                    [.. _elements.Select(element => element.Snapshot())],
                    [.. _alerts.Open.OrderBy(alert => alert.Since)]);
            }
        }
    }

    /// <summary>
    /// Says <c>Disconnected</c> once, then the heartbeat until cancelled. The values come from the
    /// session of the endpoint, once it attaches this machine.
    /// </summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await _publisher.PublishConnectionAsync(Registration.SerialNumber, connected: false).ConfigureAwait(false);
        try
        {
            await HeartbeatAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Stopped on purpose: by a removal, a new registration or the end of the service.
        }
    }

    /// <summary>
    /// Resets every alarm that stands. For a machine that is removed: nobody watches it from here on,
    /// so an alarm the adapter raised would stay open for ever. Call it after the machine left its session.
    /// </summary>
    public async Task ResetOpenAlertsAsync()
    {
        List<AlertChange> resets;
        lock (_gate)
        {
            _alerts.BeginRefresh();
            resets = [.. _alerts.EndRefresh(DateTime.UtcNow)];
        }

        foreach (var reset in resets)
        {
            await _publisher.PublishAlertAsync(Registration.SerialNumber, reset).ConfigureAwait(false);
        }
    }

    /// <inheritdoc />
    public void SessionConnecting()
    {
        lock (_gate)
        {
            if (_state != "Connected")
            {
                _state = "Connecting";
            }
        }
    }

    /// <inheritdoc />
    public async Task AttachAsync(IEndpointSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        try
        {
            _subscription = await SubscribeAsync(session.Session, cancellationToken).ConfigureAwait(false);
            await WaitForFirstValuesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await RemoveSubscriptionAsync(session).ConfigureAwait(false);
            SetState("Disconnected", exception.Message);
            throw;
        }

        await _publisher.PublishConnectionAsync(Registration.SerialNumber, connected: true).ConfigureAwait(false);
        SetState("Connected", null);
        _logger.MachineConnected(Registration.SerialNumber, Registration.Endpoint.Url, Registration.Endpoint.SecurityMode.ToString(), Registration.Endpoint.SecurityPolicy);
    }

    /// <inheritdoc />
    public async Task DetachAsync(IEndpointSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        await RemoveSubscriptionAsync(session).ConfigureAwait(false);
        await SessionDownAsync(null).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task SessionDownAsync(string? reason)
    {
        // The subscription goes with the session; a session that is gone is not asked to delete it.
        _subscription = null;
        bool wasConnected;
        lock (_gate)
        {
            wasConnected = _state == "Connected";
        }

        SetState("Disconnected", reason);
        if (wasConnected)
        {
            await _publisher.PublishConnectionAsync(Registration.SerialNumber, connected: false).ConfigureAwait(false);
            if (reason is not null)
            {
                _logger.MachineSessionLost(Registration.SerialNumber);
            }
        }
    }

    /// <summary>The adapter says that it is there for this machine, whether the machine answers or not.</summary>
    private async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        var seconds = Math.Max(1, (long)_heartbeatInterval.TotalSeconds);
        using var timer = new PeriodicTimer(_heartbeatInterval);
        do
        {
            // Counting in intervals since 1970 keeps the counter rising across a restart without a file.
            await _publisher
                .PublishHeartbeatAsync(Registration.SerialNumber, DateTimeOffset.UtcNow.ToUnixTimeSeconds() / seconds)
                .ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task RemoveSubscriptionAsync(IEndpointSession session)
    {
        if (Interlocked.Exchange(ref _subscription, null) is not { } subscription)
        {
            return;
        }

        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await session.Session.RemoveSubscriptionAsync(subscription, timeout.Token).ConfigureAwait(false);
        }
#pragma warning disable CA1031 // A subscription that cannot be deleted ends with the session; nothing else depends on it.
        catch (Exception exception)
#pragma warning restore CA1031
        {
            _logger.SessionCloseFailed(Registration.SerialNumber, exception.Message);
        }
    }

    private async Task<Subscription> SubscribeAsync(ISession session, CancellationToken cancellationToken)
    {
        var interval = (int)_samplingInterval.TotalMilliseconds;
#pragma warning disable CA2000, CS0618 // The session owns its subscriptions and disposes them. The classic subscription is the one tried against the simulator; the managed model of the stack 2.0 is a later step.
        var subscription = new Subscription(session.DefaultSubscription) { PublishingInterval = interval, PublishingEnabled = true };
#pragma warning restore CA2000, CS0618
        session.AddSubscription(subscription);
        await subscription.CreateAsync(cancellationToken).ConfigureAwait(false);

        var items = new List<(ElementRuntime Runtime, MonitoredItem Item)>();
        foreach (var runtime in _elements)
        {
            if (!TryResolve(session, runtime.Element.Node, out var node))
            {
                runtime.Set("NamespaceUnknown: the server has no namespace of this node any more.");
                continue;
            }

            var item = new MonitoredItem(subscription.DefaultItem)
            {
                StartNodeId = node,
                AttributeId = Attributes.Value,
                SamplingInterval = interval,
                QueueSize = 10,
                DisplayName = runtime.Topic,
            };
            item.Notification += (_, e) =>
            {
                if (e.NotificationValue is MonitoredItemNotification notification)
                {
                    OnValue(runtime, notification.Value);
                }
            };
            subscription.AddItem(item);
            items.Add((runtime, item));
            runtime.Set(Pending);
        }

        var alertItem = AlertItem(session, subscription);
        await subscription.ApplyChangesAsync(cancellationToken).ConfigureAwait(false);

        foreach (var (runtime, item) in items)
        {
            if (!ServiceResult.IsGood(item.Status.Error))
            {
                runtime.Set(item.Status.Error?.ToString() ?? "Bad");
                _logger.ElementNotMonitored(Registration.SerialNumber, runtime.Element.Path, runtime.Element.Node, runtime.Status);
            }
        }

        if (alertItem is not null)
        {
            if (ServiceResult.IsGood(alertItem.Status.Error))
            {
                // The server lists the conditions that stand, so alarms raised or gone while nobody listened are caught up.
                await session.CallAsync(
                    ObjectTypeIds.ConditionType,
                    MethodIds.ConditionType_ConditionRefresh,
                    cancellationToken,
                    Variant.From(subscription.Id)).ConfigureAwait(false);
            }
            else
            {
                _logger.AlertsNotMonitored(Registration.SerialNumber, alertItem.Status.Error?.ToString() ?? "Bad");
            }
        }

        return subscription;
    }

    private MonitoredItem? AlertItem(ISession session, Subscription subscription)
    {
        if (Registration.Alerts is not { } alerts)
        {
            return null;
        }

        if (!TryResolve(session, alerts.EventType, out var eventType))
        {
            _logger.AlertsNotMonitored(Registration.SerialNumber, "The server has no namespace of the event type any more.");
            return null;
        }

        var notifier = ObjectIds.Server;
        if (alerts.Notifier is { Length: > 0 } named && !TryResolve(session, named, out notifier))
        {
            _logger.AlertsNotMonitored(Registration.SerialNumber, "The server has no namespace of the notifier any more.");
            return null;
        }

        // The order of the clauses is the order of the fields in every event: see OnEvent.
        var filter = new EventFilter();
        void Select(NodeId type, uint attribute, params QualifiedName[] path)
        {
            var clause = new SimpleAttributeOperand { TypeDefinitionId = type, AttributeId = attribute };
            foreach (var name in path)
            {
                clause.BrowsePath = clause.BrowsePath.AddItem(name);
            }

            filter.SelectClauses = filter.SelectClauses.AddItem(clause);
        }

        Select(ObjectTypeIds.BaseEventType, Attributes.Value, new QualifiedName(BrowseNames.EventType));
        Select(ObjectTypeIds.BaseEventType, Attributes.Value, new QualifiedName(BrowseNames.Time));
        Select(ObjectTypeIds.BaseEventType, Attributes.Value, new QualifiedName(BrowseNames.Message));
        Select(ObjectTypeIds.BaseEventType, Attributes.Value, new QualifiedName(BrowseNames.Severity));
        Select(ObjectTypeIds.ConditionType, Attributes.NodeId);
        Select(ObjectTypeIds.ConditionType, Attributes.Value, new QualifiedName(BrowseNames.ConditionName));
        Select(ObjectTypeIds.AlarmConditionType, Attributes.Value, new QualifiedName(BrowseNames.ActiveState), new QualifiedName(BrowseNames.Id));
        Select(ObjectTypeIds.BaseEventType, Attributes.Value, new QualifiedName(BrowseNames.SourceNode));
        if (CodeField(session, alerts.CodeField) is { } code)
        {
            Select(eventType, Attributes.Value, code);
        }

        var item = new MonitoredItem(subscription.DefaultItem)
        {
            StartNodeId = notifier,
            AttributeId = Attributes.EventNotifier,
            NodeClass = NodeClass.Object,
            QueueSize = 1000,
            Filter = filter,
            DisplayName = "alerts",
        };
        item.Notification += (_, e) =>
        {
            if (e.NotificationValue is EventFieldList list)
            {
                OnEvent(list, eventType, session.NamespaceUris);
            }
        };
        subscription.AddItem(item);
        return item;
    }

    private void OnValue(ElementRuntime runtime, DataValue value)
    {
        if (StatusCode.IsBad(value.StatusCode))
        {
            // The binding has no "not available": a bad value is not published, the last good one stands.
            runtime.Set(value.StatusCode.ToString());
            return;
        }

        var raw = Unbox(value.WrappedValue);
        var converted = ValueConverter.Convert(runtime.Element, raw);
        var timestamp = TimestampOf(value);
        if (!runtime.Take(raw, converted, timestamp))
        {
            return;
        }

        Forget(_publisher.PublishValueAsync(Registration.SerialNumber, runtime.Element, converted!, timestamp));
    }

    private void OnEvent(EventFieldList list, NodeId alarmType, NamespaceTable namespaces)
    {
        var fields = list.EventFields;
        if (fields.Count < 8 || fields[0].AsBoxedObject(Variant.BoxingBehavior.Legacy) is not NodeId eventType)
        {
            return;
        }

        IReadOnlyList<AlertChange> changes;
        lock (_gate)
        {
            if (eventType.Equals(ObjectTypeIds.RefreshStartEventType))
            {
                _alerts.BeginRefresh();
                return;
            }

            if (eventType.Equals(ObjectTypeIds.RefreshEndEventType))
            {
                changes = _alerts.EndRefresh(DateTime.UtcNow);
            }
            else if (eventType.Equals(alarmType)
                && fields[4].AsBoxedObject(Variant.BoxingBehavior.Legacy) is NodeId condition
                && fields[6].AsBoxedObject(Variant.BoxingBehavior.Legacy) is bool active
                && IsOwnAlarm(condition, fields[7].AsBoxedObject(Variant.BoxingBehavior.Legacy) is NodeId source ? source : NodeId.Null, namespaces))
            {
                var at = fields[1].AsBoxedObject(Variant.BoxingBehavior.Legacy) switch
                {
                    DateTime time => DateTime.SpecifyKind(time, DateTimeKind.Utc),
                    DateTimeUtc time => time.ToDateTime(),
                    _ => DateTime.UtcNow,
                };
                var title = TextOf(fields[2].AsBoxedObject(Variant.BoxingBehavior.Legacy)) ?? string.Empty;
                var severity = fields[3].AsBoxedObject(Variant.BoxingBehavior.Legacy) is IConvertible number ? number.ToInt32(System.Globalization.CultureInfo.InvariantCulture) : 0;
                var code = (fields.Count > 8 ? TextOf(fields[8].AsBoxedObject(Variant.BoxingBehavior.Legacy)) : null) ?? TextOf(fields[5].AsBoxedObject(Variant.BoxingBehavior.Legacy)) ?? condition.ToString();
                var change = _alerts.Observe(condition.ToString(), active, code, title, severity, at > DateTime.UtcNow ? DateTime.UtcNow : at);
                changes = change is null ? [] : [change];
            }
            else
            {
                return;
            }

            if (changes.Count > 0)
            {
                _alertStore.Save(Registration.SerialNumber, _alerts.Open);
            }
        }

        foreach (var change in changes)
        {
            Forget(_publisher.PublishAlertAsync(Registration.SerialNumber, change));
        }
    }

    /// <summary>
    /// A new subscription reports every node once. Waiting for that keeps the order of the binding:
    /// the values first, then <c>Connected</c>.
    /// </summary>
    private async Task WaitForFirstValuesAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline && _elements.Any(element => element.Status == Pending))
        {
            await Task.Delay(100, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Whether an alarm is this machine's. On a server of one machine every alarm is. Behind an
    /// aggregation server (the registration names its <c>machineNode</c>) the alarms of all machines
    /// arrive at the Server object: an alarm is this machine's if its source or its condition lies in
    /// a namespace of this machine.
    /// </summary>
    private bool IsOwnAlarm(NodeId condition, NodeId source, NamespaceTable namespaces)
    {
        if (Registration.MachineNode is null || _namespaces.Count == 0)
        {
            return true;
        }

        bool Own(NodeId node) =>
            !node.IsNull && namespaces.GetString(node.NamespaceIndex) is { } uri && _namespaces.Contains(uri);
        return Own(source) || Own(condition);
    }

    private void SetState(string state, string? error)
    {
        lock (_gate)
        {
            _connectedSince = state == "Connected" ? (_state == "Connected" ? _connectedSince : DateTime.UtcNow) : null;
            _state = state;
            _lastError = error;
        }
    }

    private void Forget(Task publish) =>
        publish.ContinueWith(
            task => _logger.PublishFailed(Registration.SerialNumber, task.Exception?.GetBaseException().Message ?? string.Empty),
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);

    /// <summary>
    /// The node of this session for <c>nsu=&lt;uri&gt;;i=42</c>. The index of a namespace belongs to
    /// one run of a server, so it is looked up again on every connect.
    /// </summary>
    internal static bool TryResolve(ISession session, string text, out NodeId node)
    {
        try
        {
            node = ExpandedNodeId.Parse(text, session.NamespaceUris);
            return !node.IsNull;
        }
        catch (ServiceResultException)
        {
            node = NodeId.Null;
            return false;
        }
    }

    private static QualifiedName? CodeField(ISession session, string? field)
    {
        if (string.IsNullOrWhiteSpace(field))
        {
            return null;
        }

        var separator = field.IndexOf(';', StringComparison.Ordinal);
        if (!field.StartsWith("nsu=", StringComparison.Ordinal) || separator < 0)
        {
            return new QualifiedName(field);
        }

        var index = session.NamespaceUris.GetIndex(field["nsu=".Length..separator]);
        return index < 0 ? null : new QualifiedName(field[(separator + 1)..], (ushort)index);
    }

    private static object? Unbox(Variant value) => value.AsBoxedObject(Variant.BoxingBehavior.Legacy) switch
    {
        LocalizedText text => text.Text,
        DateTimeUtc time => time.ToDateTime(),
        var other => other,
    };

    private static string? TextOf(object? value) => value switch
    {
        null => null,
        LocalizedText text => string.IsNullOrEmpty(text.Text) ? null : text.Text,
        string text => text.Length == 0 ? null : text,
        _ => value.ToString(),
    };

    /// <summary>The time at the source, the time at the server if the source gives none, and never the future.</summary>
    private static DateTime TimestampOf(DataValue value)
    {
        var now = DateTime.UtcNow;
        var source = value.SourceTimestamp.ToDateTime();
        if (source.Year < 2000)
        {
            source = value.ServerTimestamp.ToDateTime();
        }

        return source.Year < 2000 || source > now ? now : DateTime.SpecifyKind(source, DateTimeKind.Utc);
    }

    private sealed class ElementRuntime(ElementRegistration element, string topic)
    {
        private readonly Lock _gate = new();
        private string? _raw;
        private object? _value;
        private DateTime? _timestamp;

        public ElementRegistration Element { get; } = element;

        public string Topic { get; } = topic;

        public string Status { get; private set; } = Pending;

        public void Set(string status)
        {
            lock (_gate)
            {
                Status = status;
            }
        }

        /// <summary>Takes a value. Returns whether it is to be published: convertible, and not the one sent last.</summary>
        public bool Take(object? raw, ConvertedValue? converted, DateTime timestamp)
        {
            lock (_gate)
            {
                _raw = raw is null ? null : ValueConverter.KeyOf(raw);
                if (converted is null)
                {
                    Status = "NotConvertible";
                    return false;
                }

                Status = Good;
                var same = Equals(_value, converted.Boxed) && _timestamp == timestamp;
                _value = converted.Boxed;
                _timestamp = timestamp;
                return !same;
            }
        }

        public ElementStatus Snapshot()
        {
            lock (_gate)
            {
                return new ElementStatus(Element.Area, Element.Path, Topic, Element.Node, Status, _raw, _value, Element.Unit, _timestamp);
            }
        }
    }
}
