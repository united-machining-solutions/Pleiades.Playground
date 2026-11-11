# MQTT binding (draft 0.1.0)

How machine data appears on the broker. This is a working draft for the playground. It follows the umati data
model referenced in [`../datamodel`](../datamodel/README.md) where that is simple and names every deviation below.

## Topics

```text
machines/{SerialNumber}/umati/<path>     values named by the data model
machines/{SerialNumber}/vendor/<path>    manufacturer-specific values
machines/{SerialNumber}/events/<kind>    events, see "Notifications"
```

- `{SerialNumber}` identifies the machine. It contains no `/`, `+` or `#`.
- `<path>` is the path of the element in the catalogue; every dot and every instance key is one topic level:
  `Channel[1].ChannelState` becomes `Channel/1/ChannelState`.
- One value per topic. Consumers ignore topics they do not know.

## Value envelope

UTF-8 JSON, one value per message:

```json
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": 0.82, "unit": "one" }
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": "Executing" }
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": true }
```

- `timestamp`: ISO 8601, UTC, the time of measurement at the source.
- `value`: number, string or boolean.
- `unit`: mandatory for numbers, the name of the SI unit (see "Units").
- The MQTT 5 content type names the kind of value: `baseunitvaluedto`, `stringvaluedto`, `booleanvaluedto`.
  Without a content type the Timeseries persistence takes the kind from the JSON type of `value`.
- Known gap: a number without `unit` is currently stored with the unit `one` instead of being rejected.
- There is no quality field. Whether values are current is told by `Connection/State` and
  `Connection/Heartbeat` of the machine.

## Units

SI only: one unit per quantity, conversion happens in the display.

| Quantity | `unit` | | Quantity | `unit` |
|---|---|---|---|---|
| Ratio, count, percentage (1.0 = 100 %) | `one` | | Force | `newton` |
| Length, position | `metre` | | Torque | `newtonMetre` |
| Angle | `radian` | | Pressure | `pascal` |
| Time, duration | `second` | | Power | `watt` |
| Mass | `kilogram` | | Apparent power | `voltAmpere` |
| Velocity, feed | `metrePerSecond` | | Reactive power | `var` |
| Acceleration | `metrePerSecondSquared` | | **Energy** | **`joule`** |
| Jerk | `metrePerSecondCubed` | | Current | `ampere` |
| Rotational speed | `radianPerSecond` | | Voltage | `volt` |
| Rotational acceleration | `radianPerSecondSquared` | | Frequency | `hertz` |
| Area | `squareMetre` | | Temperature | `degreeCelsius` |
| Density | `kilogramPerCubicMetre` | | Volume | `cubicMetre` |
| Electrical conductivity | `siemensPerMetre` | | Flow rate | `cubicMetrePerSecond` |

## Notifications

Alarms and messages are events. An event comes and goes; both are published with the same identifier, and the
Events API pairs them into intervals with a duration.

```text
machines/{SerialNumber}/events/notifications
```

The payload is the notification event of the Events API (see [`../openapi`](../openapi/README.md)).

- The MQTT 5 content type is mandatory and names the payload: `notificationeventdtov1`.
- The Events persistence logs and drops a message without a content type or with an unknown one. A client that
  speaks MQTT 3.1.1 cannot set the content type, so notifications need an MQTT 5 client.

## Deviations from the data model

| Topic | Data model | This binding | Why |
|---|---|---|---|
| Energy | `wattHour` | `joule` | One coherent SI unit per quantity. |
| Temperature | `kelvin` | `degreeCelsius` | Derived SI unit that people on the shop floor read. Open for discussion. |
| `State.Status` | One snapshot struct with two members | Two topics, `State/MachineryItemState` and `State/MachineryOperationMode` | The persistence stores numbers, strings and booleans. |
| Lists (`Notification.ActiveAlerts`, `Production.JobOrders`) | One list value | Not published; alarms travel as notification events | As above. |
| Alarm severity | Categories after NAMUR NE 107 | Levels of the Events API | Mapping is future work. |
| Manufacturer-specific values | `x-<domain>` prefix | `vendor/` topic level | Simple wildcard subscription. |

## Example topics of the simulator

| Topic below `machines/{SerialNumber}/` | Kind | Unit |
|---|---|---|
| `umati/Connection/State` | string | – |
| `umati/State/MachineryItemState` | string | – |
| `umati/State/MachineryOperationMode` | string | – |
| `umati/State/FeedOverride` | number | `one` |
| `umati/Channel/1/ChannelState` | string | – |
| `umati/Spindle/1/IsRotating` | boolean | – |
| `umati/Spindle/1/Override` | number | `one` |
| `umati/Production/ActiveProgram` | string | – |
| `umati/OperationCounters/PowerOnDuration` | number | `second` |
| `umati/Consumption/Electricity/Main/AcActivePowerTotal` | number | `watt` |
| `umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp` | number | `joule` |
| `vendor/Spindle/1/BearingTemperature` | number | `degreeCelsius` |
| `events/notifications` | notification event | – |
