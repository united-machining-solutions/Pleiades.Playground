using MQTTnet;
using MQTTnet.Adapter;
using MQTTnet.Diagnostics.Logger;
using MQTTnet.Exceptions;
using MQTTnet.Packets;
using MQTTnet.Protocol;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// The <see cref="IManagedMqttClient"/> of this repository: an <see cref="IMqttClient"/> with a
/// reconnect loop, subscriptions that are sent again on every new connection and a queue for
/// outgoing messages.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two loops.</b> The connection loop connects, waits <see cref="ManagedMqttClientOptions.AutoReconnectDelay"/>
/// after a failed attempt and sends the queued subscriptions; a lost connection and a new
/// subscription wake it at once. The publish loop sends the queued messages in order while there is
/// a connection and leaves them queued while there is none.
/// </para>
/// <para>
/// <b>What a failed publish means.</b> QoS 0 promises no delivery, so a message whose send failed is
/// gone. From QoS 1 on the broker may hold the message without its acknowledgement having arrived,
/// so it is sent again after the reconnect.
/// </para>
/// </remarks>
public sealed class ManagedMqttClient : IManagedMqttClient
{
    private readonly MqttNetSourceLogger _logger;

    private readonly Lock _lifecycleLock = new();
    private CancellationTokenSource? _stopping;
    private Task _loops = Task.CompletedTask;
    private volatile ManagedMqttClientOptions? _options;
    private volatile bool _disposed;

    private readonly Lock _subscriptionsLock = new();
    private readonly Dictionary<string, MqttTopicFilter> _subscriptions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, MqttTopicFilter> _pendingSubscriptions = new(StringComparer.Ordinal);
    private readonly HashSet<string> _pendingUnsubscriptions = new(StringComparer.Ordinal);

    private readonly Lock _queueLock = new();
    private readonly Queue<MqttApplicationMessage> _queue = new();

    // Signals, not counters: each loop checks the state it waits for again after every wake-up.
    private readonly SemaphoreSlim _connectionWork = new(0);
    private readonly SemaphoreSlim _connected = new(0);
    private readonly SemaphoreSlim _queuedMessages = new(0);

    // Whether the subscriptions were sent on the current connection. Written by the connection loop only:
    // cleared before every connect attempt and set after the first synchronization that follows it.
    private volatile bool _subscriptionsSent;

    /// <summary>
    /// Creates a managed client around <paramref name="client"/> and takes ownership of it.
    /// </summary>
    /// <param name="client">The MQTTnet client that holds the connection. Disposed with this instance.</param>
    /// <param name="logger">The MQTTnet logger the loops report to.</param>
    public ManagedMqttClient(IMqttClient client, IMqttNetLogger logger)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(logger);

        InternalClient = client;
        _logger = logger.WithSource(nameof(ManagedMqttClient));
        InternalClient.DisconnectedAsync += OnDisconnectedAsync;
    }

    /// <inheritdoc />
    public IMqttClient InternalClient { get; }

    /// <inheritdoc />
    public bool IsConnected => InternalClient.IsConnected;

    /// <inheritdoc />
    public bool IsStarted
    {
        get
        {
            lock (_lifecycleLock)
            {
                return _stopping is not null;
            }
        }
    }

    /// <inheritdoc />
    public int PendingApplicationMessagesCount
    {
        get
        {
            lock (_queueLock)
            {
                return _queue.Count;
            }
        }
    }

    /// <inheritdoc />
    public event Func<MqttApplicationMessageReceivedEventArgs, Task> ApplicationMessageReceivedAsync
    {
        add => InternalClient.ApplicationMessageReceivedAsync += value;
        remove => InternalClient.ApplicationMessageReceivedAsync -= value;
    }

    /// <inheritdoc />
    public event Func<MqttClientConnectedEventArgs, Task> ConnectedAsync
    {
        add => InternalClient.ConnectedAsync += value;
        remove => InternalClient.ConnectedAsync -= value;
    }

    /// <inheritdoc />
    public event Func<MqttClientDisconnectedEventArgs, Task> DisconnectedAsync
    {
        add => InternalClient.DisconnectedAsync += value;
        remove => InternalClient.DisconnectedAsync -= value;
    }

    /// <inheritdoc />
    public event Func<ConnectingFailedEventArgs, Task>? ConnectingFailedAsync;

    /// <inheritdoc />
    public event Func<ApplicationMessageSkippedEventArgs, Task>? ApplicationMessageSkippedAsync;

    /// <inheritdoc />
    public event Func<SubscriptionsChangedEventArgs, Task>? SubscriptionsChangedAsync;

    /// <inheritdoc />
    public Task StartAsync(ManagedMqttClientOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        lock (_lifecycleLock)
        {
            // Inside the lock: a start that raced a dispose would leave loops nothing could stop.
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_stopping is not null)
            {
                throw new InvalidOperationException("The managed client is already started.");
            }

            var stopping = new CancellationTokenSource();
            var token = stopping.Token;
            _stopping = stopping;
            _options = options;

            // Not cancelable on purpose: StopAsync awaits the loops, which end on their own once stopping is signaled.
            _loops = Task.WhenAll(
                Task.Run(() => MaintainConnectionAsync(options, token), CancellationToken.None),
                Task.Run(() => PublishQueuedMessagesAsync(options, token), CancellationToken.None));
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task StopAsync(bool cleanDisconnect = true)
    {
        CancellationTokenSource? stopping;
        Task loops;
        lock (_lifecycleLock)
        {
            stopping = _stopping;
            loops = _loops;
            _stopping = null;
            _loops = Task.CompletedTask;
        }

        if (stopping is null)
        {
            return;
        }

        await stopping.CancelAsync().ConfigureAwait(false);
        await loops.ConfigureAwait(false);
        stopping.Dispose();

        lock (_queueLock)
        {
            _queue.Clear();
        }

        if (cleanDisconnect && InternalClient.IsConnected)
        {
            try
            {
                await InternalClient.DisconnectAsync(new MqttClientDisconnectOptions()).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is MqttCommunicationException or OperationCanceledException)
            {
                _logger.Warning(exception, "Disconnecting failed.");
            }
        }
    }

    /// <inheritdoc />
    public async Task EnqueueAsync(MqttApplicationMessage applicationMessage)
    {
        ArgumentNullException.ThrowIfNull(applicationMessage);
        ObjectDisposedException.ThrowIf(_disposed, this);
        MqttTopicValidator.ThrowIfInvalid(applicationMessage);

        var maxPendingMessages = Math.Max(1, _options?.MaxPendingMessages ?? int.MaxValue);
        MqttApplicationMessage? skipped = null;
        lock (_queueLock)
        {
            if (_queue.Count >= maxPendingMessages)
            {
                skipped = _queue.Dequeue();
            }

            _queue.Enqueue(applicationMessage);
        }

        if (skipped is null)
        {
            _queuedMessages.Release();
        }
        else
        {
            await RaiseAsync(ApplicationMessageSkippedAsync, new ApplicationMessageSkippedEventArgs(skipped)).ConfigureAwait(false);
        }
    }

    /// <inheritdoc />
    public Task SubscribeAsync(IEnumerable<MqttTopicFilter> topicFilters)
    {
        ArgumentNullException.ThrowIfNull(topicFilters);
        ObjectDisposedException.ThrowIf(_disposed, this);

        // Checked here, where the caller still hears about it. MQTTnet checks the same when it sends,
        // and one invalid filter there would fail the SUBSCRIBE of every filter queued with it, again
        // and again.
        var filters = topicFilters.ToList();
        foreach (var topicFilter in filters)
        {
            MqttTopicValidator.ThrowIfInvalidSubscribe(topicFilter.Topic);
        }

        lock (_subscriptionsLock)
        {
            foreach (var topicFilter in filters)
            {
                _subscriptions[topicFilter.Topic] = topicFilter;
                _pendingSubscriptions[topicFilter.Topic] = topicFilter;
                _pendingUnsubscriptions.Remove(topicFilter.Topic);
            }
        }

        Signal(_connectionWork);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task UnsubscribeAsync(IEnumerable<string> topics)
    {
        ArgumentNullException.ThrowIfNull(topics);
        ObjectDisposedException.ThrowIf(_disposed, this);

        lock (_subscriptionsLock)
        {
            foreach (var topic in topics)
            {
                if (_subscriptions.Remove(topic))
                {
                    _pendingSubscriptions.Remove(topic);
                    _pendingUnsubscriptions.Add(topic);
                }
            }
        }

        Signal(_connectionWork);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        CancellationTokenSource? stopping;
        lock (_lifecycleLock)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            stopping = _stopping;
            _stopping = null;
        }

        // The loops end on their own: every wait in them observes this token.
        stopping?.Cancel();
        stopping?.Dispose();

        InternalClient.DisconnectedAsync -= OnDisconnectedAsync;
        InternalClient.Dispose();
        _connectionWork.Dispose();
        _connected.Dispose();
        _queuedMessages.Dispose();
    }

    private async Task MaintainConnectionAsync(ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (!InternalClient.IsConnected)
                {
                    _subscriptionsSent = false;
                    if (await TryConnectAsync(options, cancellationToken).ConfigureAwait(false) is { } retryAfter)
                    {
                        await Task.Delay(retryAfter, cancellationToken).ConfigureAwait(false);
                        continue;
                    }

                    QueueEverySubscriptionAgain();
                }

                var synchronized = await SynchronizeSubscriptionsAsync(options, cancellationToken).ConfigureAwait(false);

                if (!_subscriptionsSent)
                {
                    // Subscriptions first, then the queue: what the queue publishes may be answered at once.
                    _subscriptionsSent = true;
                    Signal(_connected);
                }

                // A lost connection and a new subscription end either wait at once. After a failed
                // synchronization the longer wait keeps a broker that does not answer from being asked
                // every second.
                var wait = synchronized ? options.ConnectionCheckInterval : options.AutoReconnectDelay;
                await _connectionWork.WaitAsync(wait, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // The loop is all that reconnects, so it goes on, after a pause that keeps a lasting error from spinning.
                _logger.Error(exception, "Maintaining the connection failed.");
                await Task.Delay(options.ConnectionCheckInterval, CancellationToken.None).ConfigureAwait(false);
            }
        }
    }

    /// <returns><see langword="null"/> when connected, otherwise how long to wait before the next attempt.</returns>
    private async Task<TimeSpan?> TryConnectAsync(ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        MqttClientConnectResult? result = null;
        Exception failure;
        try
        {
            using var timeout = WithTimeout(options, cancellationToken);
            result = await InternalClient.ConnectAsync(options.ClientOptions, timeout.Token).ConfigureAwait(false);
            if (result.ResultCode == MqttClientConnectResultCode.Success)
            {
                return null;
            }

            // MQTTnet 5 returns a refused CONNECT instead of throwing it.
            failure = new MqttConnectingFailedException($"Connecting with MQTT server failed ({result.ResultCode}).", null);
        }
        catch (InvalidOperationException) when (!cancellationToken.IsCancellationRequested)
        {
            // MQTTnet is still taking the previous connection down, for example after the forced
            // disconnect of the watchdog. That is no failed attempt: nothing was tried yet.
            return options.ConnectionCheckInterval;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            failure = exception;
        }

        // Not logged here: MQTTnet logs the attempt, and the event tells the host of this client.
        await RaiseAsync(ConnectingFailedAsync, new ConnectingFailedEventArgs(result, failure)).ConfigureAwait(false);
        return options.AutoReconnectDelay;
    }

    /// <summary>
    /// A SUBACK answers for the connection it came on, so a new connection needs every subscription again.
    /// </summary>
    private void QueueEverySubscriptionAgain()
    {
        lock (_subscriptionsLock)
        {
            foreach (var subscription in _subscriptions)
            {
                _pendingSubscriptions[subscription.Key] = subscription.Value;
            }
        }
    }

    /// <returns><see langword="false"/> when the broker was not reached and the subscriptions are queued again.</returns>
    private async Task<bool> SynchronizeSubscriptionsAsync(ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        List<MqttTopicFilter> subscriptions;
        List<string> unsubscriptions;
        lock (_subscriptionsLock)
        {
            if (_pendingSubscriptions.Count == 0 && _pendingUnsubscriptions.Count == 0)
            {
                return true;
            }

            subscriptions = [.. _pendingSubscriptions.Values];
            unsubscriptions = [.. _pendingUnsubscriptions];
            _pendingSubscriptions.Clear();
            _pendingUnsubscriptions.Clear();
        }

        List<MqttClientSubscribeResult> subscribeResults = [];
        List<MqttClientUnsubscribeResult> unsubscribeResults = [];
        try
        {
            using var timeout = WithTimeout(options, cancellationToken);
            if (unsubscriptions.Count > 0)
            {
                var unsubscribe = new MqttClientUnsubscribeOptions { TopicFilters = unsubscriptions };
                unsubscribeResults.Add(await InternalClient.UnsubscribeAsync(unsubscribe, timeout.Token).ConfigureAwait(false));
            }

            if (subscriptions.Count > 0)
            {
                var subscribe = new MqttClientSubscribeOptions { TopicFilters = subscriptions };
                subscribeResults.Add(await InternalClient.SubscribeAsync(subscribe, timeout.Token).ConfigureAwait(false));
            }
        }
        catch (Exception exception)
        {
            // Also when the client is stopping: what was taken from the queue is still owed after a restart.
            QueueAgain(subscriptions, unsubscriptions);
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            _logger.Warning(exception, "Synchronizing subscriptions failed.");
            return false;
        }

        await RaiseAsync(SubscriptionsChangedAsync, new SubscriptionsChangedEventArgs(subscribeResults, unsubscribeResults))
            .ConfigureAwait(false);
        return true;
    }

    private void QueueAgain(List<MqttTopicFilter> subscriptions, List<string> unsubscriptions)
    {
        lock (_subscriptionsLock)
        {
            // What was asked for in the meantime wins over what failed.
            foreach (var subscription in subscriptions.Where(subscription => _subscriptions.ContainsKey(subscription.Topic)))
            {
                _pendingSubscriptions.TryAdd(subscription.Topic, subscription);
            }

            foreach (var topic in unsubscriptions.Where(topic => !_subscriptions.ContainsKey(topic)))
            {
                _pendingUnsubscriptions.Add(topic);
            }
        }
    }

    private async Task PublishQueuedMessagesAsync(ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        // The message whose send has to be repeated, held outside the queue so that it keeps its place.
        MqttApplicationMessage? unsent = null;
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (!InternalClient.IsConnected || !_subscriptionsSent)
                {
                    // Nothing is taken from the queue without a connection, so MaxPendingMessages bounds what waits.
                    await _connected.WaitAsync(options.ConnectionCheckInterval, cancellationToken).ConfigureAwait(false);
                    continue;
                }

                var message = unsent ?? await DequeueAsync(cancellationToken).ConfigureAwait(false);
                if (message is null)
                {
                    continue;
                }

                unsent = await PublishAsync(message, options, cancellationToken).ConfigureAwait(false);
                if (unsent is not null)
                {
                    // A send that fails at once on a connection that stays up must not spin.
                    await Task.Delay(options.ConnectionCheckInterval, cancellationToken).ConfigureAwait(false);
                }
            }
            catch (Exception) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private async Task<MqttApplicationMessage?> DequeueAsync(CancellationToken cancellationToken)
    {
        await _queuedMessages.WaitAsync(cancellationToken).ConfigureAwait(false);
        lock (_queueLock)
        {
            // Empty after a signal when a full queue dropped the message the signal was for.
            return _queue.TryDequeue(out var message) ? message : null;
        }
    }

    /// <returns>The message when its send has to be repeated, otherwise <see langword="null"/>.</returns>
    private async Task<MqttApplicationMessage?> PublishAsync(
        MqttApplicationMessage message, ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = WithTimeout(options, cancellationToken);
            await InternalClient.PublishAsync(message, timeout.Token).ConfigureAwait(false);
            return null;
        }
        catch (MqttClientNotConnectedException) when (!cancellationToken.IsCancellationRequested)
        {
            // The connection went away between the check and the send. Nothing was sent, so the message stays.
            return message;
        }
        catch (Exception exception) when (
            exception is MqttCommunicationException or OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            // A broker that does not answer in time is a failed publish like a closed socket.
            _logger.Warning(exception, "Publishing an application message failed.");
            return message.QualityOfServiceLevel == MqttQualityOfServiceLevel.AtMostOnce ? null : message;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // Whatever ended the connection ended this send as well: the same case as a closed socket.
            var repeat = !InternalClient.IsConnected && message.QualityOfServiceLevel != MqttQualityOfServiceLevel.AtMostOnce;
            _logger.Error(exception, "Publishing an application message failed, the message is {0}.", repeat ? "sent again" : "dropped");
            return repeat ? message : null;
        }
    }

    /// <summary>
    /// MQTTnet applies <see cref="MqttClientOptions.Timeout"/> only to a call without a cancelable
    /// token. The loops pass theirs, so the timeout is added here: a broker that accepts the socket
    /// and never answers would otherwise hold a loop for good.
    /// </summary>
    private static CancellationTokenSource WithTimeout(ManagedMqttClientOptions options, CancellationToken cancellationToken)
    {
        var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.ClientOptions.Timeout);
        return timeout;
    }

    private Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs eventArgs)
    {
        Signal(_connectionWork);
        return Task.CompletedTask;
    }

    private void Signal(SemaphoreSlim signal)
    {
        try
        {
            if (signal.CurrentCount == 0)
            {
                signal.Release();
            }
        }
        catch (ObjectDisposedException) when (_disposed)
        {
            // Disposed in the meantime: there is no loop left to wake.
        }
    }

    /// <summary>
    /// Calls the handlers one after the other. A handler that throws is logged and does not keep the
    /// others, or the loop that raised the event, from going on.
    /// </summary>
    private async Task RaiseAsync<TEventArgs>(Func<TEventArgs, Task>? handlers, TEventArgs eventArgs)
    {
        if (handlers is null)
        {
            return;
        }

        foreach (var handler in handlers.GetInvocationList().Cast<Func<TEventArgs, Task>>())
        {
            try
            {
                await handler(eventArgs).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                _logger.Error(exception, "A handler of {0} failed.", typeof(TEventArgs).Name);
            }
        }
    }
}
