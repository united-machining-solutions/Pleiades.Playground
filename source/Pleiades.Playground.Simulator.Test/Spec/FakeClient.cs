// SPDX-License-Identifier: Apache-2.0
using MQTTnet;
using MQTTnet.Packets;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Simulator.Test.Spec;

/// <summary>An MQTT client that keeps what is published, and is connected when the test says so.</summary>
#pragma warning disable CS0067 // The events of the interface are not raised by this fake.
internal sealed class FakeClient : IManagedMqttClient
{
    public List<MqttApplicationMessage> Published { get; } = [];

    public IMqttClient InternalClient => throw new NotSupportedException();

    public bool IsConnected { get; set; }

    public bool IsStarted => true;

    public int PendingApplicationMessagesCount => 0;

    public event Func<MqttApplicationMessageReceivedEventArgs, Task>? ApplicationMessageReceivedAsync;

    public event Func<MqttClientConnectedEventArgs, Task>? ConnectedAsync;

    public event Func<MqttClientDisconnectedEventArgs, Task>? DisconnectedAsync;

    public event Func<ConnectingFailedEventArgs, Task>? ConnectingFailedAsync;

    public event Func<ApplicationMessageSkippedEventArgs, Task>? ApplicationMessageSkippedAsync;

    public event Func<SubscriptionsChangedEventArgs, Task>? SubscriptionsChangedAsync;

    public Task EnqueueAsync(MqttApplicationMessage applicationMessage)
    {
        Published.Add(applicationMessage);
        return Task.CompletedTask;
    }

    public Task StartAsync(ManagedMqttClientOptions options) => Task.CompletedTask;

    public Task StopAsync(bool cleanDisconnect = true) => Task.CompletedTask;

    public Task SubscribeAsync(IEnumerable<MqttTopicFilter> topicFilters) => Task.CompletedTask;

    public Task UnsubscribeAsync(IEnumerable<string> topics) => Task.CompletedTask;

    public void Dispose()
    {
    }
}
#pragma warning restore CS0067
