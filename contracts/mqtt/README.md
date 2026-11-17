# MQTT binding (draft 0.2.0)

How machine data appears on the broker, and values about a place. This is a working draft for the playground.
It follows the umati data model referenced in [`../datamodel`](../datamodel/README.md) where that is simple and
names every deviation below.

There are two trees on the broker. The topics below `machines/` and `sites/` are the binding of the playground,
which every service here reads. The topics below `simulators/` are a draft that follows the data model exactly,
see [Spec binding (draft)](#spec-binding-draft); no service reads them yet.

## Topics

```text
machines/{SerialNumber}/umati/<path>     values named by the data model
machines/{SerialNumber}/vendor/<path>    manufacturer-specific values
machines/{SerialNumber}/events/<kind>    events, see "Notifications"
sites/{SiteId}/{Source}/<path>           values about a place, in the names of one source
simulators/{SerialNumber}/...            the simulator of a machine after the data model, see "Spec binding"
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
  `machines`, `sites` and `simulators` is a change to this binding.

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

A proposal for the MQTT binding of the data model, version 0.15.0 (see [`../datamodel`](../datamodel/README.md)),
to be settled at the umati hackathon. Here everything is as the model says: paths, types, units, snapshots,
lists, events, manifest and connection. The binding of the playground above stays as it is; the two trees live
side by side on the same broker. Why this tree may use other units than the playground: see
[ADR-0012](../../docs/adr/0012-spec-binding-beside-the-playground-binding.md).

In the demo stack every simulator (P-04, P-07, M-02) publishes this tree in addition to its topics below
`machines/{SerialNumber}/`.
No service of the playground reads it yet.

### Topics

The tree lies below a root of its own, `simulators/`. Below the serial number comes a namespace level, as the
namespaces of OPC UA: one namespace for the model, one for the signals the machine manufacturer defines, and
below each the tree is built the same way.

```text
simulators/{SerialNumber}/umati/Manifest                       retained      the manifest
simulators/{SerialNumber}/umati/<path, every "." a level>      retained      an element of the model: value, snapshot or list
simulators/{SerialNumber}/oem/<path, every "." a level>        retained      a signal the machine manufacturer defines
simulators/{SerialNumber}/events/<topic of the group>          not retained  event
```

- The namespace level is the third level. `umati` holds the elements of the model and the manifest; `oem`, the
  signals defined by the machine manufacturer; `events`, the events. The topic carries no domain and no URI of
  the manufacturer; who the manufacturer is says the manifest.
- `umati`, `oem` and `events` are the reserved names of the namespace level; the binding uses no others.

- `simulators/` is the root: the output stands for the simulator of a machine. It lies beside `machines/`, so
  nothing mixes with the persistence and the app, which subscribe to `machines/+/umati/#`, `machines/+/vendor/#`
  and `machines/+/events/#`. The tree below `machines/` stays as it is.
- `{SerialNumber}` is the same serial number as below `machines/` (`Config:SerialNumber`). It contains no `/`,
  `+` or `#`. The machine is identified by the serial number in the topic and by its manifest:
  `machine.ProductInstanceUri`, the globally unique id the model asks for, and the values below
  `umati/Identification/` (`Manufacturer`, `SerialNumber`, `ProductInstanceUri`, `Model`, `ManufacturerUri`,
  `ProductCode`, `YearOfConstruction`, `SoftwareRevision`). `ProductInstanceUri` contains
  `/` and `:` and cannot be a topic level.
- Every segment of the path is one topic level, without encoding: `Channel.1.ChannelState` becomes
  `umati/Channel/1/ChannelState`.
- A snapshot is one topic (`umati/State/Status`), and so is a list (`umati/Production/JobOrders`, always the
  whole list).
- Every event lies below the level `events/`, on one topic per group (`events/production`,
  `events/notifications`), so `simulators/+/events/+` subscribes to exactly the events.
- Every message has QoS 1 and the MQTT 5 content type `application/json`.

```text
simulators/P-04/umati/Manifest
simulators/P-04/umati/State/Status
simulators/P-04/umati/Spindle/1/IsRotating
simulators/P-04/umati/Production/JobOrders
simulators/P-04/oem/Spindle/1/BearingTemperature
simulators/P-04/events/production
simulators/P-04/events/notifications
```

Because the tree below every namespace is built the same way, wildcards cut across it either way:

| Subscription | What it gives |
|---|---|
| `simulators/+/umati/#` | only the elements of the model, of every simulator |
| `simulators/+/oem/#` | only the signals the machine manufacturers define |
| `simulators/P-04/+/Spindle/1/#` | everything about spindle 1 of P-04, whatever the namespace |
| `simulators/+/+/Spindle/+/BearingTemperature` | the bearing temperature of every spindle, whatever the namespace |
| `simulators/+/events/+` | every event |

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
  "value": { "ExecutionId": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001", "JobOrderID": "4711/01", "ActiveWorkMaster": "WELLE_4711.MPF",
             "State": "Ended", "StartTime": "2026-11-17T08:31:00.000Z",
             "Duration": 3040.0, "PartsProduced": 1, "EnergyElectricity": 1850.5 } }
```

The rules for events, so that a consumer can keep nothing but the events and still miss none:

| Rule | What | Why |
|---|---|---|
| Topic per group | An event is published on `simulators/{SerialNumber}/events/<topic>`, one topic per group of events, the group being the first segment of its path. The binding names the topic of each group, in lower case (table below): every job order and program execution event on `events/production`, every alert event on `events/notifications`. A group without a name in the table is not published. The field `event`, the full path of the model such as `Production.JobOrderStarted`, tells the events of a topic apart. | MQTT keeps the order of messages only within one topic. On one topic `JobOrderStarted` and the `ProgramExecutionStarted` that follows arrive in the order they came up. One subscription per group is enough; `simulators/+/events/+` gets them all. The binding of the playground does the same with one topic for all notifications, `machines/{SerialNumber}/events/notifications`, and the spec binding keeps its name. |
| Envelope | `{event, timestamp, seq, seqEpoch, value}`. `event` is the path of the event, `timestamp` its source time. `seq` is an integer that counts the events of the machine within their group (`Production`, `Notification`), from 1 and without a gap: one count per topic of events. `seqEpoch` names the run of the adapter that counts: the time it started, in UTC. A new start begins a new epoch and counts from 1 again. | A consumer finds a gap and a duplicate by `(SerialNumber, group, seqEpoch, seq)`, in any technology. After a gap it reads the state again: `Production.JobOrders` and `Production.ProgramExecution` after a gap in `Production`, `Notification.ActiveAlerts` after a gap in `Notification`. |
| Delivery | QoS 1, not retained. | QoS 1 delivers at least once; a duplicate is caught by `seq`. A retained event would be a state, and a state is a value. |
| Outbox | While the broker is away the adapter keeps the events in the order they came up and sends them after the next connect, with their source time. The outbox is bounded; when it is full the oldest event is dropped and logged, and its `seq` stays a gap: nothing is numbered again. Values need no outbox, every connect publishes them whole. | Without an outbox the events of a broker outage are lost unnoticed. |
| Consumer | A consumer that keeps events subscribes with a persistent session: Clean Start false, a session expiry of for example 24 hours, QoS 1. Several instances of one consumer share the events with a shared subscription, `$share/<group>/simulators/+/events/+`. | The broker holds the events while the consumer restarts. |

| Group of events (first segment of `event`) | Topic below `simulators/{SerialNumber}/events/` |
|---|---|
| `Production` | `production` |
| `Notification` | `notifications` |

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
- `seq` and `seqEpoch` are mandatory in the envelope of the model: every event carries them, `seq` from 1 per
  machine and group.
- The fields of an alert, in `Notification.ActiveAlerts` and in every alert event, are `Id`, `ErrorCode`,
  `Message`, `Severity` (the category after NAMUR NE 107), `SeverityValue` (a number from 1 to 1000), `Time`
  (since when it stands) and `SourceName`, and `correlationId` where it came up in a program execution.

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

### Signals of the manufacturer

The signals the machine manufacturer defines lie in the same tree as the elements of the model, in the namespace
`oem`:

- In the model a signal of the manufacturer begins with exactly one prefix segment `x-<domain>`, the internet
  domain of the manufacturer with `-` for every dot (rule for names of the model). The manifest lists it so,
  for example `x-example-com.Spindle.1.BearingTemperature`, with its `type` and, for a number, its `unit`
  (`code` and `name`) and a `description`.
- The binding maps `x-<domain>.<path>` to `oem/<path>`: the prefix segment is left out, the rest of the path
  becomes topic levels. `x-example-com.Spindle.1.BearingTemperature` lies on
  `simulators/P-04/oem/Spindle/1/BearingTemperature`, at the same place of the tree as
  `simulators/P-04/umati/Spindle/1/IsRotating`, only in another namespace. The domain of the manufacturer stands
  only in the manifest; back from the topic, the manifest gives the full path. An element of the model never lies
  outside `umati`, a signal of the manufacturer never in `umati`.
- It has the same envelope as an element of the model, `{timestamp, value, unit}`, retained, QoS 1. The `unit` is
  the `name` the manifest gives; the value follows the rules of the model for units, a temperature in
  `degreeCelsius`, energy in `wattHour`.
- A consumer ignores what it does not know (must-ignore). One that knows only the model subscribes to
  `simulators/+/umati/#`.

### What the simulators publish

Every simulator of the demo stack publishes this tree, as client `<ClientId>-spec` with its own last will on
`simulators/{SerialNumber}/umati/Connection/State`. A virtual machine of its own, a state machine driven by a scenario in the
configuration (`Config:SpecOutput`), produces every value and event, so they agree with each other.
`Config:SpecOutput:ScenarioName` picks the scenario from `Config:SpecOutput:Scenarios`; without a name the
simulator runs `Config:SpecOutput:Scenario`.

| Simulator | Topics below | Scenario | Jobs | Profiles | Signals of the manufacturer |
|---|---|---|---|---|---|
| P-04 | `simulators/P-04/` | default | shafts, flanges, bushings; cycles of 45 s to 90 s, up to 15 kW | Core, Production, Spindle, Energy, AlertsEvents | `oem/Spindle/1/BearingTemperature` |
| P-07 | `simulators/P-07/` | `housings` | housings, cover plates, gearbox housings; cycles of 2.5 min to 7 min, up to 21 kW | Core, Production, Spindle, Energy, AlertsEvents | `oem/Spindle/1/BearingTemperature` |
| M-02 | `simulators/M-02/` | `small-parts` | pins, spacers, nozzles in large quantities; cycles of 20 s to 50 s, up to 7 kW | Core, Production, Spindle, Energy, AlertsEvents | `oem/Spindle/1/BearingTemperature` |

All three deliver the same kind of values below `machines/` today, a spindle included, so all three are machine
tools with a spindle and declare the same profiles. Each scenario has its own alerts, job order numbers and
counters. The signals of the manufacturer are those the simulator delivers below
`machines/{SerialNumber}/vendor/` today, here derived from the virtual machine and published in the namespace
`oem`.

Each virtual machine works like this:

- The machine works through job orders: set up, then one program execution per part, until the quantity is
  made. Each program execution has a new `ExecutionId`. Its snapshot carries `State` and `StartTime` and stays
  with `Ended` or `Aborted` until the next one begins; it is `null` only before the first.
- Now and then a running program stops on its own, a programmed halt (`Scenario:ProgramStopsPerHour`): the
  program execution is interrupted and resumed, the job order keeps running.
- Now and then the planner changes a waiting job order (`Scenario:QueueChangesPerHour`): it revokes its release,
  cancels it (`JobOrderCancelled`: aborted without having run, so with `EndTime` but without `StartTime` and
  `ProducedQuantity`) or takes it back (`JobOrderRemoved`).
- `Executing` in `State/Status`, `Active` in `Channel/1/ChannelState`, a turning spindle and a program execution
  always come together. Channel and active work master carry the `ExecutionId` as `correlationId`; the
  program execution snapshot names it inside, as `ExecutionId`, and carries no `correlationId`.
- The power is high while a program runs and lower while the machine waits or is set up. The energy counter is
  the integral of the published power, and `EnergyElectricity` of `ProgramExecutionEnded` is the same integral
  over the program execution.
- An alert of the category `Failure` comes up only while a program runs. It interrupts the program execution and
  the job order until it is cleared, or, with a set probability, aborts both (`ProgramExecutionAborted`,
  `JobOrderAborted`).
  Other alerts change nothing. Every alert carries the `ExecutionId` it came up in as `correlationId`.
- Ended and aborted job orders stay in the list as long as they stand in the plan of the machine: one shift,
  8 hours, by default (`Scenario:JobOrderRetention`). The model sets no least time; the manifest names the
  retention as `jobOrderRetention`. The history of job orders lies in their events.
- The program execution snapshot (`umati/Production/ProgramExecution`) carries, from its end until the next
  program execution begins, the sums `Duration`, `PartsProduced` and `EnergyElectricity`, the same as its end
  event. `EnergyCompressedAir` is left out: the virtual machine has no compressed air. The active program is
  `Production.ActiveWorkMaster`, in the snapshot and its events as `ActiveWorkMaster`.
- Each scenario names its machine: `Model`, `ProductCode`, `YearOfConstruction`, `SoftwareRevision`;
  `ManufacturerUri` is `https://{ManufacturerDomain}` unless set.
- A scenario may name elements the machine lacks for good (`Scenario:Unavailable`), among those the model
  allows: `State.Status`, `Notification.ActiveAlerts`, `OperationCounters.PowerOnDuration`,
  `Identification.YearOfConstruction` and `Identification.SoftwareRevision`. Such an element is published once
  with `value: null` and named in the manifest with `"available": false`; without `ActiveAlerts` there are no
  alert events either. By default nothing is unavailable.
- The counters (power-on duration, energy, parts) only grow; they are kept in `/data` across restarts.
- Its signal of the manufacturer, the temperature of the spindle bearing, warms towards a running temperature
  while the spindle turns (scaled by the spindle override) and cools back while it stands
  (`Scenario:BearingTemperatureIdle`, `BearingTemperatureRunning`, `BearingTimeConstant`).
- The events wait in an outbox of 10 000 while the broker is away (`Config:SpecOutput:EventBufferSize`).
  `seqEpoch` is the start of the simulator.

| Path below `simulators/{SerialNumber}/` | Kind | Unit |
|---|---|---|
| `umati/Manifest` | manifest | – |
| `umati/Identification/Manufacturer`, `umati/Identification/SerialNumber`, `umati/Identification/ProductInstanceUri`, `umati/Identification/Model`, `umati/Identification/ManufacturerUri`, `umati/Identification/ProductCode`, `umati/Identification/SoftwareRevision` | string | – |
| `umati/Identification/YearOfConstruction` | integer | – |
| `umati/Connection/State` | enum | – |
| `umati/Connection/Heartbeat` | integer | – |
| `umati/State/Status` | snapshot | – |
| `umati/State/FeedOverride` | number | `one` |
| `umati/Channel/1/ChannelState` | enum, `correlationId` | – |
| `umati/Production/ActiveWorkMaster` | string, `correlationId` | – |
| `umati/Production/ProgramExecution` | snapshot with `State`, `StartTime` and, after the end, the sums | – |
| `umati/Production/JobOrders` | list | – |
| `umati/OperationCounters/PartsProducedInLifetime` | integer | `piece` |
| `umati/OperationCounters/PowerOnDuration` | number | `second` |
| `umati/Notification/ActiveAlerts` | list | – |
| `umati/Spindle/1/IsRotating` | boolean | – |
| `umati/Spindle/1/Override` | number | `one` |
| `umati/Consumption/Electricity/Main/AcActivePowerTotal` | number | `watt` |
| `umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp` | number | `wattHour` |
| `oem/Spindle/1/BearingTemperature` | number, signal of the manufacturer (`x-example-com.Spindle.1.BearingTemperature` in the manifest) | `degreeCelsius` |
| `events/production` | events `Production.ProgramExecution<Started, Interrupted, Resumed, Ended, Aborted>` and `Production.JobOrder<Added, Released, Revoked, Started, Interrupted, Resumed, Ended, Aborted, Cancelled, Changed, Removed>` | – |
| `events/notifications` | events `Notification.AlertRaised`, `Notification.AlertChanged`, `Notification.AlertCleared` | – |

The tests of the simulator check every message against the JSON schemas of the model when a clone of it lies
next to this repository, or in the folder named by `UMATI_DATAMODEL_DIR`; without one they are skipped.

### Open for the hackathon

- A version level in the topic: proposed no, the version is in the manifest.
- A globally unique id of the machine in the topic. Here the topic carries the serial number only, which is
  unique on the broker of the playground but not across manufacturers; the manufacturer and the globally unique
  `ProductInstanceUri` are in the manifest and below `umati/Identification/`. Whether a binding needs more in
  the topic is open.
- The namespace level, the mapping of the prefix `x-<domain>` to `oem`, and the reserved names `umati`, `oem`
  and `events` are proposals of this binding. With one namespace `oem`, two manufacturers below one machine would
  share it; their paths must then differ.
- The topic per group below `events/`, the fields `seq` and `seqEpoch`, the outbox and the persistent session of a consumer
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
