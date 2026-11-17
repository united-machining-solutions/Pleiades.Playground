// SPDX-License-Identifier: Apache-2.0
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Production;

/// <summary>
/// Publishes the job order and program execution events of the virtual machine in the binding of the playground,
/// on <c>machines/{SerialNumber}/events/production</c>: content type <c>productioneventdtov1</c>, QoS 1, not
/// retained. It uses the connection of the generators, whose client keeps what it cannot send yet.
/// </summary>
internal sealed class ProductionEventOutput(IManagedMqttClient client, string serialNumber)
{
    // The production events count apart from the groups of the data model, without a gap from 1 in each run.
    private long _seq;

    /// <summary>The topic of the production events of a machine.</summary>
    public static string Topic(string serialNumber) => $"machines/{serialNumber}/events/production";

    /// <summary>Publishes the production events among the messages of one step of the virtual machine.</summary>
    public async Task PublishAsync(IReadOnlyList<SpecMessage> messages)
    {
        ArgumentNullException.ThrowIfNull(messages);
        foreach (var specEvent in messages.OfType<SpecEvent>())
        {
            if (ProductionEventMapper.From(specEvent, serialNumber, _seq + 1) is { } production)
            {
                _seq++;
                await client.Publish(Topic(serialNumber), production, MqttQualityOfServiceLevel.AtLeastOnce, retainMessage: false)
                    .ConfigureAwait(false);
            }
        }
    }
}
