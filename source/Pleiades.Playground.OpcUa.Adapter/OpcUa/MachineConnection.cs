using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>One element of a running machine: what was last read and what was made of it.</summary>
/// <param name="Area"><c>umati</c> or <c>oem</c>.</param>
/// <param name="Path">The path of the element.</param>
/// <param name="Node">The node it comes from.</param>
/// <param name="Status"><c>Good</c>, <c>Pending</c>, or what is wrong with the node or its value.</param>
/// <param name="Raw">The value of the node as text.</param>
/// <param name="Value">The published value.</param>
/// <param name="Unit">The unit of a number.</param>
/// <param name="Timestamp">When the value was observed at the source.</param>
internal sealed record ElementStatus(
    string Area, string Path, string Node, string Status, string? Raw, object? Value, string? Unit, DateTime? Timestamp);

/// <summary>What a machine does right now, as the adapter sees it.</summary>
/// <param name="MachineId">The machine id of its topics, or null while the machine is not identified.</param>
/// <param name="State">As <c>Connection/State</c> of the binding: <c>Initializing</c> until the first session, <c>Running</c>, <c>CommunicationFault</c>, or <c>Shutdown</c> once it is stopped.</param>
/// <param name="LastError">Why the last connect failed or the connection was lost.</param>
/// <param name="ConnectedSince">Since when the session stands.</param>
/// <param name="NeedsRescan">A node of the registration is gone: the server changed, scan it again.</param>
/// <param name="Elements">Every element with its last value.</param>
/// <param name="OpenAlerts">The alarms that stand.</param>
internal sealed record MachineStatus(
    string? MachineId,
    string State,
    string? LastError,
    DateTime? ConnectedSince,
    bool NeedsRescan,
    IReadOnlyList<ElementStatus> Elements,
    IReadOnlyList<OpenAlert> OpenAlerts);

/// <summary>
/// Runs one registered machine on the session of its endpoint: subscribes to the nodes of the
/// registration and puts what they report on the broker, through its <see cref="IMachineOutput"/>. The session belongs to <see cref="SharedSession"/>,
/// which several machines behind one aggregation server share. A machine needs nothing but the
/// registration, so it starts the same way after every restart.
/// </summary>
internal sealed class MachineConnection : ISessionTenant
{
    private const string Pending = "Pending";
    private const string Good = "Good";

    private readonly AlertStore _alertStore;
    private readonly TimeSpan _heartbeatInterval;
    private readonly TimeSpan _samplingInterval;
    private readonly ILogger _logger;
    private readonly Lock _gate = new();
    private readonly ElementRuntime[] _elements;
    private readonly AlertTracker _alerts;
    private readonly IReadOnlySet<string> _namespaces;

    private const string Initializing = "Initializing";
    private const string Running = "Running";
    private const string CommunicationFault = "CommunicationFault";
    private const string Shutdown = "Shutdown";

    private string _state = Initializing;
    private string? _lastError;
    private DateTime? _connectedSince;
    private Subscription? _subscription;
    private Subscription? _alertSubscription;
    private Task _alertTail = Task.CompletedTask;

    /// <summary>Creates the connection. Nothing happens before <see cref="RunAsync"/> and a session.</summary>
    public MachineConnection(
        MachineRegistration registration,
        IMachineOutputFactory outputs,
        AlertStore alertStore,
        TimeSpan heartbeatInterval,
        TimeSpan samplingInterval,
        ILogger logger,
        Action<IdentityRegistration>? identified = null)
    {
        ArgumentNullException.ThrowIfNull(outputs);
        Registration = registration ?? throw new ArgumentNullException(nameof(registration));
        _identified = identified;
        _alertStore = alertStore ?? throw new ArgumentNullException(nameof(alertStore));
        _heartbeatInterval = heartbeatInterval;
        _samplingInterval = samplingInterval;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _elements = [.. registration.Elements.Select(element => new ElementRuntime(element))];
        _alerts = new AlertTracker(alertStore.Load(registration.SerialNumber));
        _namespaces = MachineNamespaces.Of(registration);
        Output = outputs.Create(registration, _alerts.Open);
    }

    private readonly Action<IdentityRegistration>? _identified;

    /// <summary>What this machine puts on the broker.</summary>
    public IMachineOutput Output { get; }

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
                    Output.MachineId,
                    _state,
                    _lastError,
                    _connectedSince,
                    _elements.Any(element => element.Status is not (Good or Pending or "NotConvertible")),
                    [.. _elements.Select(element => element.Snapshot())],
                    _alerts.Open);
            }
        }
    }

    /// <summary>
    /// Connects the output to the broker (<c>Initializing</c> and the manifest), then the heartbeat until
    /// cancelled. The values come from the session of the endpoint, once it attaches this machine.
    /// </summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await Output.StartAsync().ConfigureAwait(false);
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
    /// Clears every alarm that stands. For a machine that is removed: nobody watches it from here on,
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

        await AlertsAsync(resets).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public void SessionConnecting()
    {
        // The state stays what it is while the session connects: Initializing before the first one,
        // CommunicationFault after a lost one, as Connection/State on the broker says.
    }

    /// <inheritdoc />
    public async Task AttachAsync(IEndpointSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        try
        {
            _subscription = await SubscribeAsync(session.Session, cancellationToken).ConfigureAwait(false);
            await SubscribeAlertsAsync(session.Session, cancellationToken).ConfigureAwait(false);
            await WaitForFirstValuesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await RemoveSubscriptionAsync(session).ConfigureAwait(false);
            SetState(CommunicationFault, exception.Message);
            await Output.LostAsync().ConfigureAwait(false);
            throw;
        }

        // A registration without its identity learns it from the first values.
        await IdentifyAsync().ConfigureAwait(false);
        await Output.ReachedAsync().ConfigureAwait(false);
        SetState(Running, null);
        _logger.MachineConnected(Registration.SerialNumber, Registration.Endpoint.Url, Registration.Endpoint.SecurityMode.ToString(), Registration.Endpoint.SecurityPolicy);
    }

    /// <inheritdoc />
    public async Task DetachAsync(IEndpointSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        await RemoveSubscriptionAsync(session).ConfigureAwait(false);

        // The machine leaves on purpose: it is stopped or removed, and its output says so itself.
        _subscription = null;
        _alertSubscription = null;
        SetState(Shutdown, null);
    }

    /// <inheritdoc />
    public async Task SessionDownAsync(string? reason)
    {
        // The subscriptions go with the session; a session that is gone is not asked to delete them.
        _subscription = null;
        _alertSubscription = null;
        bool wasConnected;
        lock (_gate)
        {
            wasConnected = _state == Running;
        }

        SetState(CommunicationFault, reason);

        // Also when the first connect fails: the machine is not reached, CommunicationFault. The output says it once.
        await Output.LostAsync().ConfigureAwait(false);
        if (wasConnected && reason is not null)
        {
            _logger.MachineSessionLost(Registration.SerialNumber);
        }
    }

    /// <summary>The adapter says that it is there for this machine, whether the machine answers or not.</summary>
    private async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(_heartbeatInterval);
        do
        {
            await Output.HeartbeatAsync().ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task RemoveSubscriptionAsync(IEndpointSession session)
    {
        await RemoveAsync(session.Session, Interlocked.Exchange(ref _subscription, null)).ConfigureAwait(false);
        await RemoveAsync(session.Session, Interlocked.Exchange(ref _alertSubscription, null)).ConfigureAwait(false);
    }

    private async Task RemoveAsync(ISession session, Subscription? subscription)
    {
        if (subscription is null)
        {
            return;
        }

        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await session.RemoveSubscriptionAsync(subscription, timeout.Token).ConfigureAwait(false);
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

        // Kept before it exists on the server, as the alarm subscription is: an attach that fails on the way
        // removes it, and a retry does not leave one more behind each time.
        _subscription = subscription;
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
                DisplayName = runtime.Element.Path,
            };
            item.Notification += (_, e) =>
            {
                if (e.NotificationValue is MonitoredItemNotification notification)
                {
                    OnValue(runtime, notification.Value, session.NamespaceUris);
                }
            };
            subscription.AddItem(item);
            items.Add((runtime, item));
            runtime.Set(Pending);
        }

        await subscription.ApplyChangesAsync(cancellationToken).ConfigureAwait(false);

        foreach (var (runtime, item) in items)
        {
            if (!ServiceResult.IsGood(item.Status.Error))
            {
                runtime.Set(item.Status.Error?.ToString() ?? "Bad");
                _logger.ElementNotMonitored(Registration.SerialNumber, runtime.Element.Path, runtime.Element.Node, runtime.Status);
            }
        }

        return subscription;
    }

    /// <summary>
    /// Subscribes to the alarms of the registration, in a subscription of their own: ConditionRefresh
    /// works on a whole subscription, and a server may refuse it for one that also holds data items
    /// (open62541 answers BadFilterNotAllowed). Alarms are an addition to the values: if they cannot
    /// be monitored, the machine runs without them, and the reason is logged.
    /// </summary>
    private async Task SubscribeAlertsAsync(ISession session, CancellationToken cancellationToken)
    {
        if (Registration.Alerts is null)
        {
            return;
        }

#pragma warning disable CA2000, CS0618 // The session owns its subscriptions and disposes them; see SubscribeAsync.
        var subscription = new Subscription(session.DefaultSubscription)
        {
            PublishingInterval = (int)_samplingInterval.TotalMilliseconds,
            PublishingEnabled = true,
        };
#pragma warning restore CA2000, CS0618
        if (AlertItem(session, subscription) is not { } item)
        {
            subscription.Dispose();
            return;
        }

        // Set before it exists on the server, so that a failure on the way removes it with the others.
        _alertSubscription = subscription;
        try
        {
            session.AddSubscription(subscription);
            await subscription.CreateAsync(cancellationToken).ConfigureAwait(false);
            subscription.AddItem(item);
            await subscription.ApplyChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ServiceResultException exception)
        {
            _logger.AlertsNotMonitored(Registration.SerialNumber, exception.Message);
            await RemoveAsync(session, Interlocked.Exchange(ref _alertSubscription, null)).ConfigureAwait(false);
            return;
        }

        if (!ServiceResult.IsGood(item.Status.Error))
        {
            _logger.AlertsNotMonitored(Registration.SerialNumber, item.Status.Error?.ToString() ?? "Bad");
            await RemoveAsync(session, Interlocked.Exchange(ref _alertSubscription, null)).ConfigureAwait(false);
            return;
        }

        try
        {
            // The server lists the conditions that stand, so alarms raised or gone while nobody listened are caught up.
            await session.CallAsync(
                ObjectTypeIds.ConditionType,
                MethodIds.ConditionType_ConditionRefresh,
                cancellationToken,
                Variant.From(subscription.Id)).ConfigureAwait(false);
        }
        catch (ServiceResultException exception)
        {
            // New alarms still arrive on the subscription; only the catch-up is missing.
            _logger.AlertsNotRefreshed(Registration.SerialNumber, exception.Message);
        }
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
        return item;
    }

    private void OnValue(ElementRuntime runtime, DataValue value, NamespaceTable namespaces)
    {
        if (StatusCode.IsBad(value.StatusCode))
        {
            // The binding has no "not available": a bad value is not published, the last good one stands.
            runtime.Set(value.StatusCode.ToString());
            return;
        }

        var raw = RawValues.Of(value.WrappedValue, namespaces);
        var converted = ValueConverter.Convert(runtime.Element, raw);
        var timestamp = TimestampOf(value);
        if (!runtime.Take(raw, converted, timestamp))
        {
            return;
        }

        Forget(Output.ValueAsync(runtime.Element, converted!, timestamp));

        // A value of the identification that comes late, after an initial Bad, may complete the identity.
        if (Output.MachineId is null && runtime.Element.Area == Topics.ModelArea && Topics.Identity.Contains(runtime.Element.Path))
        {
            Forget(IdentifyAsync());
        }
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
                var message = TextOf(fields[2].AsBoxedObject(Variant.BoxingBehavior.Legacy)) ?? string.Empty;
                var severity = fields[3].AsBoxedObject(Variant.BoxingBehavior.Legacy) is IConvertible number ? number.ToInt32(System.Globalization.CultureInfo.InvariantCulture) : 0;
                var code = (fields.Count > 8 ? TextOf(fields[8].AsBoxedObject(Variant.BoxingBehavior.Legacy)) : null) ?? TextOf(fields[5].AsBoxedObject(Variant.BoxingBehavior.Legacy)) ?? condition.ToString();
                var change = _alerts.Observe(condition.ToString(), active, code, message, severity, at > DateTime.UtcNow ? DateTime.UtcNow : at);
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

        Forget(AlertsAsync(changes));
    }

    /// <summary>
    /// Puts alert changes on the broker one after the other, in the order they came: each with the list of the
    /// alerts that stood after it. A change that comes while others still go out waits for them.
    /// </summary>
    private Task AlertsAsync(IReadOnlyList<AlertChange> changes)
    {
        if (changes.Count == 0)
        {
            return Task.CompletedTask;
        }

        lock (_gate)
        {
            // The list after each change, taken now: it goes back from the list that stands after the last one.
            var steps = new List<(AlertChange Change, IReadOnlyList<OpenAlert> Open)>();
            var open = _alerts.Open.ToList();
            for (var i = changes.Count - 1; i >= 0; i--)
            {
                steps.Insert(0, (changes[i], [.. open.OrderBy(alert => alert.Since)]));
                var conditionId = changes[i].Alert.ConditionId;
                if (changes[i].Action == AlertAction.Raised)
                {
                    open.RemoveAll(alert => alert.ConditionId == conditionId);
                }
                else
                {
                    open.Add(changes[i].Alert);
                }
            }

            _alertTail = _alertTail.ContinueWith(
                async _ =>
                {
                    foreach (var (change, after) in steps)
                    {
                        await Output.AlertAsync(change, after).ConfigureAwait(false);
                    }
                },
                CancellationToken.None,
                TaskContinuationOptions.None,
                TaskScheduler.Default).Unwrap();
            return _alertTail;
        }
    }

    /// <summary>Identifies the machine from the values of its identification, once they are there, and keeps the identity.</summary>
    private async Task IdentifyAsync()
    {
        if (Output.MachineId is null
            && MachineOutput.IdentityOf(ValueOf, Registration.SerialNumber) is { } identity)
        {
            await Output.IdentifyAsync(identity).ConfigureAwait(false);
            if (Output.MachineId is not null && Interlocked.Exchange(ref _identifiedOnce, 1) == 0)
            {
                _identified?.Invoke(identity);
            }
        }
    }

    private int _identifiedOnce;

    /// <summary>The value an element of the model has now, as text, or null.</summary>
    private string? ValueOf(string path) =>
        _elements.FirstOrDefault(element => element.Element.Area == Topics.ModelArea && element.Element.Path == path)?.Text;

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
            _connectedSince = state == Running ? (_state == Running ? _connectedSince : DateTime.UtcNow) : null;
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

    private sealed class ElementRuntime(ElementRegistration element)
    {
        private readonly Lock _gate = new();
        private string? _raw;
        private object? _value;
        private DateTime? _timestamp;

        public ElementRegistration Element { get; } = element;

        /// <summary>The published value as text, or null before the first one.</summary>
        public string? Text
        {
            get
            {
                lock (_gate)
                {
                    return _value is null ? null : ValueConverter.KeyOf(_value);
                }
            }
        }

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
                return new ElementStatus(Element.Area, Element.Path, Element.Node, Status, _raw, _value, Element.Unit, _timestamp);
            }
        }
    }
}
