using MQTTnet;

namespace Pleiades.Playground.Mqtt.Extensions;

/// <summary>
/// The broker's answers to the subscriptions and removals a <see cref="IManagedMqttClient"/> sent.
/// </summary>
/// <param name="subscribeResult">The SUBACKs, one result code per topic filter.</param>
/// <param name="unsubscribeResult">The UNSUBACKs, one result code per topic filter.</param>
public sealed class SubscriptionsChangedEventArgs(
    IReadOnlyList<MqttClientSubscribeResult> subscribeResult,
    IReadOnlyList<MqttClientUnsubscribeResult> unsubscribeResult) : EventArgs
{
    /// <summary>The SUBACKs, one result code per topic filter.</summary>
    public IReadOnlyList<MqttClientSubscribeResult> SubscribeResult { get; } =
        subscribeResult ?? throw new ArgumentNullException(nameof(subscribeResult));

    /// <summary>The UNSUBACKs, one result code per topic filter.</summary>
    public IReadOnlyList<MqttClientUnsubscribeResult> UnsubscribeResult { get; } =
        unsubscribeResult ?? throw new ArgumentNullException(nameof(unsubscribeResult));
}

/// <summary>
/// A connect attempt of a <see cref="IManagedMqttClient"/> that did not end in a connection.
/// </summary>
/// <param name="connectResult">The broker's CONNACK, or <see langword="null"/> when none arrived.</param>
/// <param name="exception">Why the attempt failed.</param>
public sealed class ConnectingFailedEventArgs(MqttClientConnectResult? connectResult, Exception exception) : EventArgs
{
    /// <summary>The broker's CONNACK, or <see langword="null"/> when none arrived.</summary>
    public MqttClientConnectResult? ConnectResult { get; } = connectResult;

    /// <summary>Why the attempt failed.</summary>
    public Exception Exception { get; } = exception ?? throw new ArgumentNullException(nameof(exception));
}

/// <summary>
/// A queued message that a <see cref="IManagedMqttClient"/> dropped because its queue was full.
/// </summary>
/// <param name="applicationMessage">The dropped message.</param>
public sealed class ApplicationMessageSkippedEventArgs(MqttApplicationMessage applicationMessage) : EventArgs
{
    /// <summary>The dropped message.</summary>
    public MqttApplicationMessage ApplicationMessage { get; } =
        applicationMessage ?? throw new ArgumentNullException(nameof(applicationMessage));
}
