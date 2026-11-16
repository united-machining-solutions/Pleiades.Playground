# MQTT binding (draft 0.2.0)

How machine data appears on the broker, and values about a place. This is a working draft for the playground.
It follows the umati data model referenced in [`../datamodel`](../datamodel/README.md) where that is simple and
names every deviation below.

There are two trees on the broker. The topics below `machines/` and `sites/` are the binding of the playground,
which every service here reads. The topics below `umati/` are a draft that follows the data model exactly, see
[Spec binding (draft)](#spec-binding-draft); no service reads them yet.

## Topics

```text
machines/{SerialNumber}/umati/<path>     values named by the data model
machines/{SerialNumber}/vendor/<path>    manufacturer-specific values
machines/{SerialNumber}/events/<kind>    events, see "Notifications"
sites/{SiteId}/{Source}/<path>           values about a place, in the names of one source
```

The first two levels of a topic say what a value is about, the third says whose names follow.

- `{SerialNumber}` identifies the machine. It contains no `/`, `+` or `#`.
- `<path>` is the path of the element in the catalogue; every dot and every instance key is one topic level:
  `Channel[1].ChannelState` becomes `Channel/1/ChannelState`.
- One value per topic. Consumers ignore topics they do not know.

A value that belongs to no machine is about a place:

- `{SiteId}` names the place. It contains no `/`, `+` or `#`, like `{SerialNumber}`.
- `{Source}` names the source of the values in lower case, for example `weather`. One adapter per source.
- `<path>` below a source is in PascalCase, one value per topic. Envelope, units and content types are those
  of a machine.
- A source says that it is there the way a machine does: with `Connection/State` and `Connection/Heartbeat`
  below `sites/{SiteId}/{Source}/`. So whether a value is current reads the same for a machine and for a
  place.
- A new source below `sites/` adds its rows to "Example topics of a source". A new first level beside
  `machines` and `sites` is a change to this binding.

## Value envelope

UTF-8 JSON, one value per message:

```json
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": 0.82, "unit": "one" }
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": "Executing" }
{ "timestamp": "2026-11-16T09:15:00.120Z", "value": true }
```

- `timestamp`: ISO 8601, UTC, the time of measurement at the source. It never lies in the future: a forecast
  is not a value of this binding.
- `value`: number, string or boolean.
- `unit`: mandatory for numbers, the name of the SI unit (see "Units").
- The MQTT 5 content type names the kind of value: `baseunitvaluedto`, `stringvaluedto`, `booleanvaluedto`.
  Without a content type the Timeseries persistence takes the kind from the JSON type of `value`.
- Known gap: a number without `unit` is currently stored with the unit `one` instead of being rejected.
- There is no quality field. Whether values are current is told by `Connection/State` and
  `Connection/Heartbeat` of the machine, or of the source of a place.

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

## Example topics of a source

The stack ships no source. The rows show the shape with one example, the outside temperature of a place.

| Topic below `sites/{SiteId}/weather/` | Kind | Unit |
|---|---|---|
| `Connection/State` | string | – |
| `Connection/Heartbeat` | number | `one` |
| `AirTemperature` | number | `degreeCelsius` |

```text
sites/demo/weather/Connection/State       { "timestamp": "2026-11-16T09:10:00Z", "value": "Connected" }
sites/demo/weather/Connection/Heartbeat   { "timestamp": "2026-11-16T09:10:05Z", "value": 4711, "unit": "one" }
sites/demo/weather/AirTemperature         { "timestamp": "2026-11-16T09:10:00Z", "value": 10.7, "unit": "degreeCelsius" }
```

## Spec binding (draft)

A proposal for the MQTT binding of the data model, version 0.13.0 (see [`../datamodel`](../datamodel/README.md)),
to be settled at the umati hackathon. Here everything is as the model says: paths, types, units, snapshots,
lists, events, manifest and connection. The binding of the playground above stays as it is; the two trees live
side by side on the same broker. Why this tree may use other units than the playground: see
[ADR-0010](../../docs/adr/0010-spec-binding-beside-the-playground-binding.md).

In the demo stack the simulator of P-04 publishes this tree in addition to its topics below `machines/P-04/`.
No service of the playground reads it yet.

### Topics

```text
umati/{machineId}/Manifest                                retained      the manifest
umati/{machineId}/<path, every "." a level>               retained      value envelope: a value, a snapshot or a list
umati/{machineId}/events/<event path, every "." a level>  not retained  event
```

- `umati/` is a fixed root for the standard. It does not collide with other data on a shared broker.
- `{machineId}` is one topic level of `[A-Za-z0-9_-]`: the internet domain of the manufacturer with `-` for every
  dot, then `_`, then the serial number, for example `example-com_P-04`. `ProductInstanceUri` contains `/` and `:`
  and cannot be a level; it is a value in the manifest and below `Identification`.
- Every segment of the path is one topic level, without encoding: `Channel.1.ChannelState` becomes
  `Channel/1/ChannelState`. Wildcards work: `umati/+/Consumption/Electricity/+/AcActivePowerTotal`.
- A snapshot is one topic (`State/Status`), and so is a list (`Production/JobOrders`, always the whole list).
- Every event lies below the level `events/`, so `umati/+/events/#` subscribes to exactly the events, and
  `umati/{machineId}/#` without that level to the values.
- Every message has QoS 1 and the MQTT 5 content type `application/json`.

```text
umati/example-com_P-04/Manifest
umati/example-com_P-04/State/Status
umati/example-com_P-04/Channel/1/ChannelState
umati/example-com_P-04/Production/JobOrders
umati/example-com_P-04/events/Notification/AlertRaised
umati/example-com_P-04/events/Production/JobOrderChanged
```

### Value envelope

```json
{ "timestamp": "2026-11-17T09:15:00.000Z", "value": 12034.5, "unit": "watt" }
{ "timestamp": "2026-11-17T09:15:02.123Z", "value": { "MachineryItemState": "Executing", "MachineryOperationMode": "Processing" } }
{ "timestamp": "2026-11-17T09:15:02.120Z", "value": "Active", "correlationId": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001" }
```

- `timestamp`: source time, UTC, ISO 8601 with `Z`.
- `value`: number, string, boolean, a flat object (snapshot), an array (list), or `null` for "not available
  right now". An empty list `[]` means "no entries".
- `unit`: with every number whose element has a unit in the catalogue of the model, its name there (`unit.name`),
  for example `watt`, `wattHour`, `second`, `piece`, `one`. The value is always in that unit.
- `correlationId`: the `ExecutionId` of the program execution a value belongs to, on the elements where the model
  allows it and only while a program execution exists.

### Events

```json
{ "event": "Production.ProgramExecutionEnded", "timestamp": "2026-11-17T09:21:40.000Z",
  "seq": 1842, "seqEpoch": "2026-11-17T06:58:12.000Z",
  "value": { "ExecutionId": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001", "JobOrderID": "4711/01", "ActiveProgram": "WELLE_4711.MPF",
             "State": "Ended", "StartTime": "2026-11-17T08:31:00.000Z",
             "Duration": 3040.0, "PartsProduced": 1, "EnergyElectricity": 1850.5 } }
```

The rules for events, so that a consumer can keep nothing but the events and still miss none:

| Rule | What | Why |
|---|---|---|
| Subtree | An event is published on `umati/{machineId}/events/<path>`, its path with every dot a level, for example `events/Production/JobOrderChanged`. | `umati/+/events/#` subscribes to exactly the events. |
| Envelope | `{event, timestamp, seq, seqEpoch, value}`. `event` is the path of the event, `timestamp` its source time. `seq` is an integer that counts every event of the machine, from 1 and without a gap. `seqEpoch` names the run of the adapter that counts: the time it started, in UTC. A new start begins a new epoch and counts from 1 again. | A consumer finds a gap and a duplicate by `(machineId, seqEpoch, seq)`, in any technology. |
| Delivery | QoS 1, not retained. | QoS 1 delivers at least once; a duplicate is caught by `seq`. A retained event would be a state, and a state is a value. |
| Outbox | While the broker is away the adapter keeps the events in the order they came up and sends them after the next connect, with their source time. The outbox is bounded; when it is full the oldest event is dropped and logged, and its `seq` stays a gap: nothing is numbered again. Values need no outbox, every connect publishes them whole. | Without an outbox the events of a broker outage are lost unnoticed. |
| Consumer | A consumer that keeps events subscribes with a persistent session: Clean Start false, a session expiry of for example 24 hours, QoS 1. Several instances of one consumer share the events with a shared subscription, `$share/<group>/umati/+/events/#`. | The broker holds the events while the consumer restarts. |

- An adapter that names the events of a list in its manifest publishes one for every change of the list, the
  first entries included. So the events alone give the same list as the value. Every `ProgramExecutionStarted`
  is followed by exactly one `ProgramExecutionEnded` or `ProgramExecutionAborted`.
- A change of the state of a job order or a program execution brings an event named after the state reached,
  as the model lists them: `JobOrderReleased`, `JobOrderRevoked`, `JobOrderStarted`, `JobOrderInterrupted`,
  `JobOrderResumed`, `JobOrderEnded`, `JobOrderAborted`, `JobOrderCancelled`, and `ProgramExecutionStarted`,
  `ProgramExecutionInterrupted`, `ProgramExecutionResumed`, `ProgramExecutionEnded`, `ProgramExecutionAborted`.
  Each carries the whole entry or snapshot after the change; the last two also the sums over the program
  execution, its interruptions included.
- `JobOrderChanged` comes only without a change of state, when another discrete field changes, such as a
  quantity. A field that keeps running, such as `ActualProductionTime`, does not bring one on its own; an event
  carries its value at the moment of the change. A job order taken back before it started leaves with
  `JobOrderRemoved`, without a change of state.
- Whoever needs the current state reads the value, not the events.
- `seq` and `seqEpoch` are fields of this binding, not of the model. The event schema of the model rejects
  them; an event passes it once they are taken off, as `unit` with the values.

### Manifest and connection

- The manifest is retained and comes before the values. It names the model version, the profiles, the
  heartbeat interval, the retention of ended job orders (`jobOrderRetention`), the instances, every element and
  every event.
- On every connect the publisher sends `Connection/State` = `Disconnected`, then the manifest, then every value
  again, and only then `Connected`. So `Connected` never stands over values of an earlier connection.
- The last will is `Connection/State` = `Disconnected`, retained. A clean stop publishes it itself. The other
  retained values stay on the broker; whether they are current says `Connection/State`, or a
  `Connection/Heartbeat` that stops coming.

### Units

Exactly those of the catalogue. Unlike the binding of the playground, energy is in `wattHour`; a temperature is
in `degreeCelsius` in both.

### What the simulator publishes

A virtual machine, a state machine driven by a scenario in the configuration (`Config:SpecOutput`), produces
every value and event of this tree, so they agree with each other:

- The machine works through job orders: set up, then one program execution per part, until the quantity is
  made. Each program execution has a new `ExecutionId`. Its snapshot carries `State` and `StartTime` and stays
  with `Ended` or `Aborted` until the next one begins; it is `null` only before the first.
- Now and then a running program stops on its own, a programmed halt (`Scenario:ProgramStopsPerHour`): the
  program execution is interrupted and resumed, the job order keeps running.
- Now and then the planner changes a waiting job order (`Scenario:QueueChangesPerHour`): it revokes its release,
  cancels it (`JobOrderCancelled`, aborted without having run) or takes it back (`JobOrderRemoved`).
- `Executing` in `State/Status`, `Active` in `Channel/1/ChannelState`, a turning spindle and a program execution
  always come together. Channel, active program and program execution carry the `ExecutionId` as
  `correlationId`.
- The power is high while a program runs and lower while the machine waits or is set up. The energy counter is
  the integral of the published power, and `EnergyElectricity` of `ProgramExecutionEnded` is the same integral
  over the program execution.
- An alert of the category `Failure` comes up only while a program runs. It interrupts the program execution and
  the job order until it is cleared, or, with a set probability, aborts both (`ProgramExecutionAborted`,
  `JobOrderAborted`).
  Other alerts change nothing. Every alert carries the `ExecutionId` it came up in as `correlationId`.
- Ended and aborted job orders stay in the list for 24 hours, the least the model allows. A shorter time is a
  demo setting (`Scenario:JobOrderRetention`); the manifest then leaves out `jobOrderRetention`.
- The counters (power-on duration, energy, parts) only grow; they are kept in `/data` across restarts.
- The events wait in an outbox of 10 000 while the broker is away (`Config:SpecOutput:EventBufferSize`).
  `seqEpoch` is the start of the simulator.

| Path below `umati/{machineId}/` | Kind | Unit |
|---|---|---|
| `Manifest` | manifest | – |
| `Identification/Manufacturer`, `Identification/SerialNumber`, `Identification/ProductInstanceUri` | string | – |
| `Connection/State` | enum | – |
| `Connection/Heartbeat` | integer | – |
| `State/Status` | snapshot | – |
| `State/FeedOverride` | number | `one` |
| `Channel/1/ChannelState` | enum, `correlationId` | – |
| `Production/ActiveProgram` | string, `correlationId` | – |
| `Production/ProgramExecution` | snapshot with `State` and `StartTime`, `correlationId` | – |
| `Production/JobOrders` | list | – |
| `OperationCounters/PartsProducedInLifetime` | integer | `piece` |
| `OperationCounters/PowerOnDuration` | number | `second` |
| `Notification/ActiveAlerts` | list | – |
| `Spindle/1/IsRotating` | boolean | – |
| `Spindle/1/Override` | number | `one` |
| `Consumption/Electricity/Main/AcActivePowerTotal` | number | `watt` |
| `Consumption/Electricity/Main/AcActiveEnergyTotalImportHp` | number | `wattHour` |
| `events/Production/ProgramExecution<Started, Interrupted, Resumed, Ended, Aborted>` | event | – |
| `events/Production/JobOrder<Added, Released, Revoked, Started, Interrupted, Resumed, Ended, Aborted, Cancelled, Changed, Removed>` | event | – |
| `events/Notification/AlertRaised`, `events/Notification/AlertChanged`, `events/Notification/AlertCleared` | event | – |

The tests of the simulator check every message against the JSON schemas of the model when a clone of it lies
next to this repository, or in the folder named by `UMATI_DATAMODEL_DIR`; without one they are skipped.

### Open for the hackathon

- A version level in the topic: proposed no, the version is in the manifest.
- The final form of `{machineId}`.
- The subtree `events/`, the fields `seq` and `seqEpoch`, the outbox and the persistent session of a consumer
  are proposals of this binding. Whether `seq` and `seqEpoch` belong to the model (they would serve every
  technology), and whether `seqEpoch` belongs in each event or in the manifest, is open. Here it is in each
  event, so that a stored event names its epoch without the manifest it came with.
- When a job order turns `Running`: at the start of the setup, as here, or at the first program execution.
- Whether an MQTT 5 user property names the kind of a message (value, event, manifest).
- `Connection.Heartbeat` is an integer without a unit in the catalogue, while the binding asks for a unit with
  every number. The simulator sends none.
- The numbers inside snapshots, list entries and events (`ProducedQuantity`, `Duration`, `EnergyElectricity`)
  carry no unit on the wire; their unit is only in the catalogue.
- The schema of the runtime values rejects every field besides `value`, `timestamp` and `correlationId`, so an
  envelope with `unit` passes it only once `unit` is taken off again.
- The timestamp of the last will is the time of the connect: the broker publishes it as it was set then.
- A cancelled job order: the table of job order events of the model says its entry has no `StartTime`, but the
  schemas ask `StartTime` and `ProducedQuantity` of every entry in `Aborted`, so no cancelled entry can pass
  them. The simulator follows the table and sends neither; its schema tests add both to such an entry before
  they check it.
