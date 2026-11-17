// SPDX-License-Identifier: Apache-2.0
using MQTTnet.Protocol;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Production;

/// <summary>
/// Publishes the production events of the virtual machine in the binding of the playground, QoS 1, not retained:
/// the job events on <c>machines/{SerialNumber}/events/jobs</c> (content type <c>jobeventdtov1</c>) and the work
/// master events on <c>machines/{SerialNumber}/events/workmasters</c> (<c>workmastereventdtov1</c>). It uses the
/// connection of the generators, whose client keeps what it cannot send yet.
/// </summary>
internal sealed class ProductionEventOutput(IManagedMqttClient client, string serialNumber)
{
    // Each type counts its events on its own topic, without a gap from 1 in each run.
    private long _jobSeq;
    private long _workMasterSeq;

    /// <summary>The topic of the job events of a machine.</summary>
    public static string JobTopic(string serialNumber) => $"machines/{serialNumber}/events/jobs";

    /// <summary>The topic of the work master events of a machine.</summary>
    public static string WorkMasterTopic(string serialNumber) => $"machines/{serialNumber}/events/workmasters";

    /// <summary>Publishes the production events among the messages of one step of the virtual machine.</summary>
    public async Task PublishAsync(IReadOnlyList<SpecMessage> messages)
    {
        ArgumentNullException.ThrowIfNull(messages);
        foreach (var specEvent in messages.OfType<SpecEvent>())
        {
            if (ProductionEventMapper.ToJobEvent(specEvent, serialNumber, _jobSeq + 1) is { } job)
            {
                _jobSeq++;
                await client.Publish(JobTopic(serialNumber), job, MqttQualityOfServiceLevel.AtLeastOnce, retainMessage: false)
                    .ConfigureAwait(false);
            }
            else if (ProductionEventMapper.ToWorkMasterEvent(specEvent, serialNumber, _workMasterSeq + 1) is { } workMaster)
            {
                _workMasterSeq++;
                await client.Publish(WorkMasterTopic(serialNumber), workMaster, MqttQualityOfServiceLevel.AtLeastOnce, retainMessage: false)
                    .ConfigureAwait(false);
            }
        }
    }
}
