using System.Collections.Concurrent;
using System.Collections.ObjectModel;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.HealthChecks.Mqtt;

/// <summary>
/// What an MQTT consumer is actually ready to do, as opposed to whether its socket is up.
/// Register it as a singleton (<see cref="HealthChecksBuilderExtensions.AddMqttSubscription"/> does),
/// inject it into the worker, hand it the broker's SUBACKs and mark what the worker asked for.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why <c>AddMqtt()</c> is not enough.</b> That check reports
/// <see cref="IManagedMqttClient.IsConnected"/>, which is true from
/// the MQTT CONNECT onwards — <b>before any subscription exists</b>. MQTT delivers nothing to a client
/// that subscribes afterwards, so for a service whose whole job is a subscription that is not
/// readiness: the process is up, the endpoint answers, <c>depends_on: service_healthy</c> is
/// satisfied, and every message published into that window is gone with nothing saying so.
/// </para>
/// <para>
/// This type exists so that closing that gap is a few lines in a worker rather than a new file in
/// every service that subscribes to MQTT.
/// </para>
/// <para>
/// <b>Subscribed means granted, not queued.</b> <c>SubscribeAsync</c> of the managed client queues the
/// subscription and returns at once, with no broker as well. The broker's answer arrives later on
/// <see cref="IManagedMqttClient.SubscriptionsChangedAsync"/>, one result code per topic filter. So the
/// worker states what it asked for with <see cref="MarkRequested"/>, hands that event to
/// <see cref="HandleSubscriptionsChangedAsync"/>, and the check reports Healthy only once every
/// requested filter came back <c>GrantedQoS0</c>, <c>GrantedQoS1</c> or <c>GrantedQoS2</c>. A refusal
/// such as <c>NotAuthorized</c> keeps it Unhealthy, and the reason names each filter that is not
/// granted with its code, or with "no SUBACK" while the answer is outstanding.
/// </para>
/// <para>
/// <b>The fault matters as much as the subscription.</b> A <c>BackgroundService</c> whose
/// <c>ExecuteAsync</c> returns leaves the host running: the process alive, the endpoint answering, no
/// work being done. <see cref="MarkFaulted"/> makes that visible even in the moment before the host
/// finishes stopping — and the worker should rethrow as well, so
/// <c>BackgroundServiceExceptionBehavior.StopHost</c> ends the process and the container's restart
/// policy brings it back.
/// </para>
/// <para>
/// <b>The marks are assertions about the present, not events.</b> "I asked for these filters" or
/// "I am subscribed to this and consuming" against "I am not consuming, and here is why" — the last
/// one wins, in either direction. A worker that recovers therefore reports healthy again by calling
/// the method that reads like it should. <b>The fault is deliberately not terminal</b>, even though
/// the recommended worker below never returns from one: that is a property of <i>that</i> worker, and
/// a managed client which reconnects and re-subscribes, or a retry loop around a recoverable
/// condition, is an equally legitimate shape. Making the fault terminal here would leave those
/// permanently unhealthy while the one API they would reach for accepted the call and did nothing.
/// </para>
/// <para>
/// <b>A set that changes at runtime.</b> <see cref="MarkRequested"/> takes the whole set, so a
/// consumer whose topics follow its configuration marks it again after every change. A filter new to
/// the set counts only after its own SUBACK; one the broker has granted stays granted until an
/// UNSUBACK withdraws it. An empty set is a statement as well: there is nothing to receive, and the
/// check reports Healthy rather than "not subscribed yet".
/// </para>
/// <para>
/// <b>What it cannot see.</b> A SUBACK answers for the connection it came on. After a reconnect the
/// managed client subscribes again and the new codes replace the old ones; until they arrive, the
/// check still reports the previous answer, while <c>AddMqtt()</c> reports the interruption itself.
/// <see cref="MarkSubscribed"/>, the client-side mark this type started with, sees no SUBACK at all: a
/// broker that refuses the SUBSCRIBE satisfies it while delivering nothing. It stays for the
/// consumers that have not moved to <see cref="MarkRequested"/> yet.
/// </para>
/// <example>
/// <code>
/// // Program.cs
/// builder.Services.AddHealthChecks()
///     .AddMqtt()               // the transport
///     .AddMqttSubscription();  // what this service can actually do
///
/// // Worker.cs
/// _client.ApplicationMessageReceivedAsync += HandleAsync;                           // handler FIRST
/// _client.SubscriptionsChangedAsync += _readiness.HandleSubscriptionsChangedAsync;  // then the SUBACKs
/// _readiness.MarkRequested(_config.Topic);      // Unhealthy until the broker grants it
/// await _client.SubscribeAsync(_config.Topic);  // only QUEUES the subscription
/// ...
/// catch (Exception ex) { _readiness.MarkFaulted(ex.Message); LogFailed(_logger, ex); throw; }
/// </code>
/// </example>
/// </remarks>
public sealed class MqttSubscriptionReadiness
{
    private readonly ConcurrentDictionary<string, MqttClientSubscribeResultCode> _resultCodes =
        new(StringComparer.Ordinal);

    private volatile ReadOnlyCollection<string>? _requestedTopics;
    private volatile string? _subscribedTopic;
    private volatile string? _fault;

    /// <summary>
    /// The topic filters named by <see cref="MarkRequested"/>, or <see langword="null"/> while the
    /// worker has not called it, and again after <see cref="MarkSubscribed"/> or
    /// <see cref="MarkFaulted"/>.
    /// </summary>
    public IReadOnlyList<string>? RequestedTopics => _requestedTopics;

    /// <summary>The topic filter named by <see cref="MarkSubscribed"/>, or <see langword="null"/>.</summary>
    public string? SubscribedTopic => _subscribedTopic;

    /// <summary>Why the worker stopped, or <see langword="null"/> while it is running.</summary>
    public string? Fault => _fault;

    /// <summary>
    /// What the broker last answered for <paramref name="topicFilter"/>, or <see langword="null"/>
    /// when there is no answer: never subscribed, still queued, or withdrawn by an UNSUBACK.
    /// </summary>
    /// <param name="topicFilter">The filter exactly as it was subscribed.</param>
    /// <returns>The result code of the filter's last SUBACK, or <see langword="null"/>.</returns>
    public MqttClientSubscribeResultCode? GetResultCode(string topicFilter)
    {
        ArgumentNullException.ThrowIfNull(topicFilter);

        return _resultCodes.TryGetValue(topicFilter, out var code) ? code : null;
    }

    /// <summary>
    /// Called with every topic filter the worker subscribes to, before <c>SubscribeAsync</c>. From then
    /// on the check is Healthy only once the broker has granted each of them. <b>Clears a prior
    /// <see cref="MarkFaulted"/></b>, as <see cref="MarkSubscribed"/> does.
    /// </summary>
    /// <param name="topicFilters">The whole set, not an addition to it: a consumer whose topics change
    /// at runtime calls this again after every change. Empty means there is nothing to receive. The
    /// filters reach the health-check payload, so a wrong configuration is distinguishable from a
    /// broker that never answers.</param>
    /// <exception cref="ArgumentException">A filter is <see langword="null"/> or empty.</exception>
    /// <remarks>
    /// The fault is written last, for the reason given on <see cref="MarkSubscribed"/>.
    /// </remarks>
    public void MarkRequested(params IEnumerable<string> topicFilters)
    {
        ArgumentNullException.ThrowIfNull(topicFilters);

        var requested = topicFilters.Distinct(StringComparer.Ordinal).ToList();
        if (requested.Exists(string.IsNullOrEmpty))
        {
            throw new ArgumentException("A topic filter is null or empty.", nameof(topicFilters));
        }

        _requestedTopics = requested.AsReadOnly();
        _subscribedTopic = null;
        _fault = null;
    }

    /// <summary>
    /// The handler for <see cref="IManagedMqttClient.SubscriptionsChangedAsync"/>, which the managed client raises
    /// after the SUBACK and the UNSUBACK with one result code per topic filter. Attach it before the
    /// first <c>SubscribeAsync</c>, or an early answer is missed.
    /// </summary>
    /// <param name="eventArgs">The broker's answers. A SUBACK records the code of each filter,
    /// replacing an earlier one; an UNSUBACK withdraws it.</param>
    /// <returns>A completed task: the handler only records.</returns>
    public Task HandleSubscriptionsChangedAsync(SubscriptionsChangedEventArgs eventArgs)
    {
        ArgumentNullException.ThrowIfNull(eventArgs);

        // The managed client never puts one filter into both lists of the same event, so the order only matters
        // to a reader: what was removed, then what was granted.
        foreach (var item in eventArgs.UnsubscribeResult.SelectMany(result => result.Items))
        {
            _resultCodes.TryRemove(item.TopicFilter, out _);
        }

        foreach (var item in eventArgs.SubscribeResult.SelectMany(result => result.Items))
        {
            _resultCodes[item.TopicFilter.Topic] = item.ResultCode;
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Called once <c>SubscribeAsync</c> has returned for <paramref name="topic"/>: the client-side
    /// mark, which sees no SUBACK. Prefer <see cref="MarkRequested"/>. <b>Clears a prior
    /// <see cref="MarkFaulted"/></b> — a worker that recovers becomes healthy again.
    /// </summary>
    /// <param name="topic">The topic filter that was subscribed. It reaches the health-check payload,
    /// so a wrong configuration is distinguishable from a broker that never delivers.</param>
    /// <remarks>
    /// The writes are ordered fault-last, and <see cref="MarkFaulted"/> is the mirror of it, so that a
    /// health check interleaved with either call reads the <i>specific</i> state rather than a
    /// half-applied one: recovering it reports the stale fault, never "not subscribed yet" about a
    /// service that is; faulting it reports the reason, never the generic message.
    /// </remarks>
    public void MarkSubscribed(string topic)
    {
        _subscribedTopic = topic;
        _requestedTopics = null;
        _fault = null;
    }

    /// <summary>
    /// Called when the worker is about to stop because of <paramref name="reason"/>. Reversible:
    /// <see cref="MarkRequested"/> and <see cref="MarkSubscribed"/> clear it again.
    /// </summary>
    /// <param name="reason">Reaches the health-check payload; an operator otherwise sees only that
    /// something is wrong.</param>
    public void MarkFaulted(string reason)
    {
        _fault = reason;
        _subscribedTopic = null;
        _requestedTopics = null;
    }

    /// <summary>Whether <paramref name="code"/> is one of the three grants.</summary>
    internal static bool IsGranted(MqttClientSubscribeResultCode? code) =>
        code is MqttClientSubscribeResultCode.GrantedQoS0
            or MqttClientSubscribeResultCode.GrantedQoS1
            or MqttClientSubscribeResultCode.GrantedQoS2;
}
