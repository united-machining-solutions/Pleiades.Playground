using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Notification.DataTransferObjects;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Mapping;

/// <summary>Publishes what the adapter knows about a machine, by the MQTT binding.</summary>
internal interface IMachinePublisher
{
    /// <summary>One value of an element, with the time it was observed at the source.</summary>
    Task PublishValueAsync(string serialNumber, ElementRegistration element, ConvertedValue value, DateTime timestamp);

    /// <summary><c>Connection/State</c>: whether the adapter reaches the machine.</summary>
    Task PublishConnectionAsync(string serialNumber, bool connected);

    /// <summary><c>Connection/Heartbeat</c>: the sign of life of the adapter for this machine.</summary>
    Task PublishHeartbeatAsync(string serialNumber, long count);

    /// <summary>An alarm that was raised or reset.</summary>
    Task PublishAlertAsync(string serialNumber, AlertChange change);
}

/// <summary>The publisher on the broker.</summary>
internal sealed class MachinePublisher : IMachinePublisher
{
    private readonly IManagedMqttClient _mqtt;

    /// <summary>Creates the publisher on the managed client of the service.</summary>
    public MachinePublisher(IManagedMqttClient mqtt)
    {
        _mqtt = mqtt ?? throw new ArgumentNullException(nameof(mqtt));
    }

    /// <inheritdoc/>
    public Task PublishValueAsync(string serialNumber, ElementRegistration element, ConvertedValue value, DateTime timestamp)
    {
        ArgumentNullException.ThrowIfNull(element);
        ArgumentNullException.ThrowIfNull(value);
        var topic = Topics.Value(serialNumber, element.Area, element.Path);
        if (value.Number is { } number)
        {
            // The validator has checked the unit; a registration edited by hand falls back to 'one'.
            _ = ValueConverter.TryParseUnit(element.Unit, out var unit);
            return _mqtt.Publish(topic, new BaseUnitValueDto { Timestamp = timestamp, Value = number, Unit = unit });
        }

        return value.Flag is { } flag
            ? _mqtt.Publish(topic, new BooleanValueDto { Timestamp = timestamp, Value = flag })
            : _mqtt.Publish(topic, new StringValueDto { Timestamp = timestamp, Value = value.Text ?? string.Empty });
    }

    /// <inheritdoc/>
    public Task PublishConnectionAsync(string serialNumber, bool connected) =>
        _mqtt.Publish(
            Topics.Value(serialNumber, "umati", Topics.ConnectionState),
            new StringValueDto { Timestamp = DateTime.UtcNow, Value = connected ? "Connected" : "Disconnected" });

    /// <inheritdoc/>
    public Task PublishHeartbeatAsync(string serialNumber, long count) =>
        _mqtt.Publish(
            Topics.Value(serialNumber, "umati", Topics.ConnectionHeartbeat),
            new BaseUnitValueDto { Timestamp = DateTime.UtcNow, Value = count, Unit = BaseUnit.One });

    /// <inheritdoc/>
    public Task PublishAlertAsync(string serialNumber, AlertChange change)
    {
        ArgumentNullException.ThrowIfNull(change);
        return _mqtt.Publish(Topics.Notifications(serialNumber), new NotificationEventDtoV1
        {
            Id = AlertTracker.NewId(),
            MId = serialNumber,
            Timestamp = change.At,
            Level = change.Alert.Level,
            Action = change.Action,
            Title = change.Alert.Title,
            LocalizedTitle = change.Alert.Title,
            NotificationId = change.Alert.Code,
            CorrelationId = change.Alert.CorrelationId,
        });
    }
}
