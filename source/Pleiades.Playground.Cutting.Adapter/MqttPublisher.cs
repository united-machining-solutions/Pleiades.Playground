using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// Publishes in the envelope of the MQTT binding: a value below <c>machines/{SerialNumber}/umati/</c>, an alarm
/// at <c>machines/{SerialNumber}/events/notifications</c>. The content type names the kind of value.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed class MqttPublisher(IManagedMqttClient client, IOptions<Config> config) : IPublisher
{
    private string SerialNumber => config.Value.SerialNumber;

    public async Task PublishAsync(IReadOnlyList<Publication> publications)
    {
        ArgumentNullException.ThrowIfNull(publications);
        foreach (var publication in publications)
        {
            await PublishAsync(publication).ConfigureAwait(false);
        }
    }

    private Task PublishAsync(Publication publication)
    {
        return publication switch
        {
            TextPublication text => client.Publish(Topic(text.Path),
                new StringValueDto { Timestamp = text.Timestamp, Value = text.Value }),
            NumberPublication number => client.Publish(Topic(number.Path),
                new BaseUnitValueDto { Timestamp = number.Timestamp, Value = number.Value, Unit = number.Unit }),
            AlarmPublication alarm => client.Publish($"machines/{SerialNumber}/events/notifications",
                new NotificationEventDtoV1
                {
                    Id = System.Security.Cryptography.RandomNumberGenerator.GetHexString(24, lowercase: true),
                    MId = SerialNumber,
                    Timestamp = alarm.Timestamp,
                    Level = EventLevel.Error,
                    Action = alarm.Action,
                    NotificationId = alarm.NotificationId,
                    Title = alarm.Title,
                    LocalizedTitle = alarm.Title,
                    CorrelationId = alarm.CorrelationId,
                }),
            _ => Task.CompletedTask,
        };
    }

    private string Topic(string path) => $"machines/{SerialNumber}/umati/{path}";
}
