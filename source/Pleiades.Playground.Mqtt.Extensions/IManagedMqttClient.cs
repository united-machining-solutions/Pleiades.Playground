using MQTTnet;
using MQTTnet.Packets;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// An MQTT client that keeps itself connected: it reconnects after a lost connection, subscribes
/// again on every new connection and queues outgoing messages while there is none.
/// </summary>
/// <remarks>
/// MQTTnet 5 no longer ships a managed client, so this repository carries the part of it that its
/// services use. <see cref="ManagedMqttClient"/> is the implementation.
/// </remarks>
[System.Diagnostics.CodeAnalysis.SuppressMessage(
    "Design",
    "CA1003:Use generic event handler instances",
    Justification = "Asynchronous events with the shape MQTTnet uses for IMqttClient, three of them forwarded from it.")]
public interface IManagedMqttClient : IDisposable
{
    /// <summary>The MQTTnet client that holds the connection, for a ping or a forced disconnect.</summary>
    IMqttClient InternalClient { get; }

    /// <summary>Whether the connection to the broker is up right now.</summary>
    bool IsConnected { get; }

    /// <summary>Whether <see cref="StartAsync"/> was called and <see cref="StopAsync"/> was not.</summary>
    bool IsStarted { get; }

    /// <summary>The number of outgoing messages that wait for a connection.</summary>
    int PendingApplicationMessagesCount { get; }

    /// <summary>Raised for every message the broker delivers.</summary>
    event Func<MqttApplicationMessageReceivedEventArgs, Task> ApplicationMessageReceivedAsync;

    /// <summary>Raised after every successful connect, the first one and each reconnect.</summary>
    event Func<MqttClientConnectedEventArgs, Task> ConnectedAsync;

    /// <summary>Raised when the connection is lost or a connect attempt ends.</summary>
    event Func<MqttClientDisconnectedEventArgs, Task> DisconnectedAsync;

    /// <summary>Raised when a connect attempt fails; the next one follows after the reconnect delay.</summary>
    event Func<ConnectingFailedEventArgs, Task> ConnectingFailedAsync;

    /// <summary>Raised when a queued message is dropped because the queue is full.</summary>
    event Func<ApplicationMessageSkippedEventArgs, Task> ApplicationMessageSkippedAsync;

    /// <summary>
    /// Raised with the broker's SUBACK and UNSUBACK, one result code per topic filter. This is the
    /// answer to <see cref="SubscribeAsync"/>, which only queues.
    /// </summary>
    event Func<SubscriptionsChangedEventArgs, Task> SubscriptionsChangedAsync;

    /// <summary>
    /// Starts the connection loop and returns at once; the connection itself is reported by
    /// <see cref="ConnectedAsync"/> or <see cref="ConnectingFailedAsync"/>.
    /// </summary>
    /// <param name="options">How to connect and how to queue.</param>
    /// <returns>A completed task.</returns>
    Task StartAsync(ManagedMqttClientOptions options);

    /// <summary>Stops the connection loop and disconnects. Queued messages are discarded.</summary>
    /// <param name="cleanDisconnect">Whether to send DISCONNECT to the broker before closing.</param>
    /// <returns>A task that completes once the client is stopped.</returns>
    Task StopAsync(bool cleanDisconnect = true);

    /// <summary>
    /// Queues a message. It is published as soon as there is a connection, in the order of the queue.
    /// </summary>
    /// <param name="applicationMessage">The message to publish.</param>
    /// <returns>A task that completes once the message is queued, not once it is published.</returns>
    Task EnqueueAsync(MqttApplicationMessage applicationMessage);

    /// <summary>
    /// Queues subscriptions. They are sent on the current connection and again on every later one.
    /// </summary>
    /// <param name="topicFilters">The topic filters to subscribe to.</param>
    /// <returns>A task that completes once the subscriptions are queued, not once they are granted.</returns>
    Task SubscribeAsync(IEnumerable<MqttTopicFilter> topicFilters);

    /// <summary>Queues the removal of subscriptions.</summary>
    /// <param name="topics">The topic filters exactly as they were subscribed.</param>
    /// <returns>A task that completes once the removal is queued.</returns>
    Task UnsubscribeAsync(IEnumerable<string> topics);
}
