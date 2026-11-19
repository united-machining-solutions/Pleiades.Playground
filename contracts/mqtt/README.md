# MQTT binding (draft 0.3.0)

How machine data appears on the broker, and values about a place. This is a working draft for the playground.

There is one tree for machines on the broker, `machines/`. It follows the umati data model referenced in
[`../datamodel`](../datamodel/README.md) exactly: paths, types, units, snapshots, lists, CloudEvents, manifest and
connection, see [Machines: the binding of the data model](#machines-the-binding-of-the-data-model). Values about
a place lie below `sites/`, see [Places](#places-sites).

The earlier binding of `machines/` (values in joule below `umati/` and `vendor/`, events as DTOs of the Events
API) is replaced, see [Replaced: the earlier binding of machines/](#replaced-the-earlier-binding-of-machines).
The simulators publish only the new tree, and persistence, APIs, MCP tools and the app read only it.

## Topics

```text
machines/{MachineId}/umati/Manifest      the manifest of the machine
machines/{MachineId}/umati/<path>        an element of the data model
machines/{MachineId}/oem/<path>          a signal the machine manufacturer defines
machines/{MachineId}/events/<group>      CloudEvents: jobs, workmasters, notifications
sites/{SiteId}/{Source}/<path>           values about a place, in the names of one source
hub/<topic>                              registration of apps at the Pleiades Hub, owned by its contract
```

The first two levels of a topic say what a value is about, the third says whose names follow.

- `{MachineId}` is `<manufacturer>_<model>_<serial number>`, for example `alcyone-machines_AX-400_P-04`; see
  [Machine id](#machine-id).
- One value per topic. Consumers ignore topics they do not know.

## Places (`sites/`)

A value that belongs to no machine is about a place:

- `{SiteId}` names the place. It contains no `/`, `+` or `#`.
- `{Source}` names the source of the values in lower case, for example `weather`. One adapter per source.
- `<path>` below a source is in PascalCase, one value per topic, with the value envelope and the units below,
  which hold for places: a place is not a machine of the data model.
- A source says that it is there: with `Connection/State` and `Connection/Heartbeat` below
  `sites/{SiteId}/{Source}/`.
- A new source below `sites/` adds its rows to "Example topics of a source". A new first level beside
  `machines`, `sites` and `hub` is a change to this binding.

The first level `hub/` carries no values. It carries the registration of apps at the Pleiades Hub, the page
that shows the apps of a Pleiades system under one header:

- Its topics, `hub/discover`, `hub/clients/{ClientId}/announce` and `hub/clients/{ClientId}/offline`, and
  their payloads are defined by the contract of the hub, `contracts/mqtt/README.md` in the repository
  `umati/pleiades-hub`, not here. This binding only reserves the level and says who owns it; the decision
  is [ADR-0021](../../docs/adr/0021-hub-registration.md).
- What this document says about a value does not apply below `hub/`: the envelope, the units, the content
  types and `Connection/State`. The messages there are not values. They are JSON, published with QoS 1 and
  never retained.

### Value envelope of a place

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
  `Connection/Heartbeat` of the source of the place.

### Units of a place

SI only: one unit per quantity, conversion happens in the display ([ADR-0002](../../docs/adr/0002-si-units-joule-and-one.md)).
A machine below `machines/` carries the units of the data model instead, energy in `wattHour`.

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

## Replaced: the earlier binding of `machines/`

Until now `machines/{SerialNumber}/` carried a binding of the playground: values in coherent SI units below
`umati/` and `vendor/` and events as DTOs of the Events API. The data model is now the binding of `machines/`,
and the stack reads only it; the earlier text of this section is in the history of this file.

### How the stack stores it

- The Timeseries persistence subscribes to `machines/+/umati/#`, `machines/+/oem/#` and `sites/+/#`. It keeps a
  value with the unit it came with (`wattHour`, `degreeCelsius` …) and converts nothing; a number without a unit
  is kept as `one`. A snapshot such as `State/Status` is kept field by field, as
  `machines/{MachineId}/umati/State/Status/MachineryItemState`; its strings and booleans become series, its numbers
  carry no unit and are not kept. Lists (`JobOrders`, `ActiveAlerts`, the software of the identification), `null`
  and the manifest are no series: job orders and alerts come from the views of the Events API, the identification
  from its single values.
- The Events persistence subscribes to `machines/+/events/jobs`, `machines/+/events/workmasters` and
  `machines/+/events/notifications` with QoS 1 in a persistent session (Clean Start false, a fixed client id and a
  session expiry of one day), takes what has the content type `application/cloudevents+json`, and stores the
  CloudEvent as it came with the machine id of its topic. `source` and `id` together are unique, so an event the
  broker delivers twice is stored once.

### Example topics of a source

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

## Machines: the binding of the data model

A proposal for the MQTT binding of the data model, version 0.17.1 (see [`../datamodel`](../datamodel/README.md)),
to be settled at the umati hackathon. Here everything is as the model says: paths, types, units, snapshots,
lists, events, manifest and connection. It is the binding of `machines/`; why: see
[ADR-0015](../../docs/adr/0015-the-binding-of-machines-follows-the-data-model.md).

In the demo stack every simulator (P-04, P-07, M-02), the adapters of two real devices, an Ultimaker printer
and a juice bar, the adapters of the three cutting machines, the bending adapter and the OPC UA adapter publish this tree, and the services of the playground read only it (see "How the stack stores
it").

### Topics

The tree lies below `machines/`. Below the machine id comes a namespace level, as the
namespaces of OPC UA: one namespace for the model, one for the signals the machine manufacturer defines, and
below each the tree is built the same way.

```text
machines/{MachineId}/umati/Manifest                       retained      the manifest
machines/{MachineId}/umati/<path, every "." a level>      retained      an element of the model: value, snapshot or list
machines/{MachineId}/oem/<path, every "." a level>        retained      a signal the machine manufacturer defines
machines/{MachineId}/events/<topic of the group>          not retained  event
```

- The namespace level is the third level. `umati` holds the elements of the model and the manifest; `oem`, the
  signals defined by the machine manufacturer; `events`, the events. The topic carries no domain and no URI of
  the manufacturer; who the manufacturer is says the manifest.
- `umati`, `oem` and `events` are the reserved names of the namespace level; the binding uses no others.

- `machines/` is the root of every machine; `sites/` beside it holds places.
- `{MachineId}` is `<manufacturer>_<model>_<serial number>`, for example `alcyone-machines_AX-400_P-04` (see "Machine
  id" below). The manifest names it as `machineId`. The machine is identified by it in the topic and by its
  manifest: `machine.ProductInstanceUri`, the globally unique id the model asks for, and the values below
  `umati/Identification/` (`Manufacturer`, `SerialNumber`, `ProductInstanceUri`, `Model`, `ManufacturerUri`,
  `ProductCode`, `YearOfConstruction`). `ProductInstanceUri` contains
  `/` and `:` and cannot be a topic level.
- Every segment of the path is one topic level, without encoding: `Channel.1.ChannelState` becomes
  `umati/Channel/1/ChannelState`.
- The first segment of a path below the identification and the state is its profile, so the tree follows the
  profiles: `umati/JobMonitoring/…`, `umati/WorkMasterMonitoring/…`.
- A snapshot is one topic (`umati/State/Status`), and so is a list (`umati/JobMonitoring/JobOrders`, always the
  whole list).
- Every event lies below the level `events/`, on one topic per group (`events/jobs`,
  `events/workmasters`, `events/notifications`), so `machines/+/events/+` subscribes to exactly the events.
- Every message has QoS 1. Values and the manifest have the MQTT 5 content type `application/json`, events
  `application/cloudevents+json; charset=utf-8`.

```text
machines/alcyone-machines_AX-400_P-04/umati/Manifest
machines/alcyone-machines_AX-400_P-04/umati/State/Status
machines/alcyone-machines_AX-400_P-04/umati/Spindle/1/IsRotating
machines/alcyone-machines_AX-400_P-04/umati/JobMonitoring/JobOrders
machines/alcyone-machines_AX-400_P-04/umati/JobMonitoring/JobOrderResults
machines/alcyone-machines_AX-400_P-04/oem/Spindle/1/BearingTemperature
machines/alcyone-machines_AX-400_P-04/events/jobs
machines/alcyone-machines_AX-400_P-04/events/workmasters
machines/alcyone-machines_AX-400_P-04/events/notifications
```

Because the tree below every namespace is built the same way, wildcards cut across it either way:

| Subscription | What it gives |
|---|---|
| `machines/+/umati/#` | only the elements of the model, of every simulator |
| `machines/+/oem/#` | only the signals the machine manufacturers define |
| `machines/alcyone-machines_AX-400_P-04/+/Spindle/1/#` | everything about spindle 1 of P-04, whatever the namespace |
| `machines/alcyone-machines_AX-400_P-04/#` | everything of P-04 |
| `machines/+/+/Spindle/+/BearingTemperature` | the bearing temperature of every spindle, whatever the namespace |
| `machines/+/events/+` | every event |

### Machine id

The level below `machines/` names the machine: `<manufacturer>_<model>_<serial number>`. The adapter forms it
once from values it publishes anyway:

| Part | From | Example |
|---|---|---|
| manufacturer | the domain of `Identification.ManufacturerUri` in lower case, without a leading `www.` and without its top-level domain, every dot a `-` | `https://www.alcyone-machines.example` → `alcyone-machines` |
| model | `Identification.Model` | `AX-400` |
| serial number | `Identification.SerialNumber` | `P-04` |

Each part is normalised: `ä`, `ö`, `ü`, `ß` become `ae`, `oe`, `ue`, `ss` (`Ä`, `Ö`, `Ü` become `Ae`, `Oe`,
`Ue`), other accents are dropped, every other character than `A-Z`, `a-z`, `0-9` and `-` becomes `-`, several `-`
become one, none stands at the start or the end, and a part has at most 64 characters. An empty part is
`unknown`. `_` separates the parts and never occurs in one; so the id holds no `/`, `+`, `#`, `.` or space, and
nothing that MQTT, NATS or a file system would read otherwise.

| ManufacturerUri, Model, SerialNumber | Machine id |
|---|---|
| `https://www.alcyone-machines.example`, `AX-400`, `P-04` | `alcyone-machines_AX-400_P-04` |
| `https://www.taygeta-precision.example`, `TP-800`, `P-07` | `taygeta-precision_TP-800_P-07` |
| `https://www.merope-microtec.example`, `MM-120`, `M-02` | `merope-microtec_MM-120_M-02` |
| `https://machines.example.co.uk`, `AX-400`, `P-04` | `machines-example-co_AX-400_P-04` |
| `https://müller-maschinen.de`, `Schleifer 5/2`, `SN 0815#a` | `mueller-maschinen_Schleifer-5-2_SN-0815-a` |

Only the last label of the domain goes, the top-level domain. With an ending of several labels, such as `co.uk`,
the rest stays (`co`), as the row above shows: the rule needs no list of endings, and the id stays the same for a
manufacturer as long as its domain does. A subdomain stays a part of the id.

The domain stays when the company is renamed; the display name of the manufacturer is not used. The id is a
proposal of this binding, not an element of the model: globally unique stays `ProductInstanceUri`, also as the
`source` of every event.

#### Without a ManufacturerUri

Some OPC UA servers have no node for `Identification.ManufacturerUri`. For such a machine, and only then, the
[OPC UA adapter](#what-the-adapters-of-real-devices-publish) takes `Identification.Manufacturer` instead: the name with `ä`, `ö`,
`ü`, `ß` written out as above, other accents dropped and every character but `A-Z`, `a-z` and `0-9` removed,
dots included, so that no part of it is taken for a top-level domain. This stand-in is published as
`umati/Identification/ManufacturerUri`, the manufacturer part of the machine id and the prefix `x-<domain>` are
formed from it by the rules above, and so is a `ProductInstanceUri` the server does not give
(`{ManufacturerUri}/{Model}/{SerialNumber}`).

| Manufacturer, Model, SerialNumber | `ManufacturerUri` | Machine id | Prefix |
|---|---|---|---|
| `TRUMPF Werkzeugmaschinen SE + Co. KG`, `TruLaser 5030`, `A0280O0001` | `TRUMPFWerkzeugmaschinenSECoKG` | `trumpfwerkzeugmaschinensecokg_TruLaser-5030_A0280O0001` | `x-trumpfwerkzeugmaschinensecokg` |

A consumer should know what it then gets: `ManufacturerUri` is no web address, a formed `ProductInstanceUri`
(`TRUMPFWerkzeugmaschinenSECoKG/TruLaser%205030/A0280O0001`) is a relative URI reference and no absolute URI,
and the id changes with the name of the manufacturer, not with its domain. A server that has a node for
`ManufacturerUri` and gives no value yet gets no stand-in: the machine waits for the value. A name without any
letter or digit `A-Z`, `0-9`, such as one in Japanese, cannot stand in; such a machine is not added.

A wildcard takes a whole level, so it selects every machine (`machines/+/umati/#`) or one
(`machines/alcyone-machines_AX-400_P-04/#`); MQTT has no wildcard for a part of a level. Who wants the machines of
one manufacturer or model filters on the id after `_`, or reads the manifests.

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

An event is a CloudEvent 1.0 in the JSON format, structured mode, as the model asks:

```json
{ "specversion": "1.0", "id": "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60", "source": "https://www.alcyone-machines.example/AX-400/P-04",
  "type": "WorkMasterMonitoring.ProgramExecutionEnded", "time": "2026-11-17T09:21:40.000Z",
  "sequence": "20261117T065812Z.000000001842", "correlationid": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001",
  "dataschema": "urn:umati2:datamodel:0.17.1:event.schema.json",
  "data": { "ExecutionId": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001", "JobOrderID": "4711/01", "ActiveWorkMaster": "WM-SHAFT-4711",
            "State": "Ended", "StartTime": "2026-11-17T08:31:00.000Z",
            "Duration": 3040.0, "PartsProduced": 1, "EnergyElectricity": 1850.5 } }
```

The rules for events, so that a consumer can keep nothing but the events and still miss none:

| Rule | What | Why |
|---|---|---|
| Topic per group | An event is published on `machines/{MachineId}/events/<topic>`, one topic per group of events, the group being the first segment of its path. The binding names the topic of each group, in lower case (table below): every event of a job order and its result on `events/jobs`, every event of a program execution on `events/workmasters`, every alert event on `events/notifications`. A group without a name in the table is not published. The topic names the subject of the events, not the profile: the profiles are called …Monitoring, but the events of a job order may come from a job management (ordering) one day too. The attribute `type`, the full path of the model such as `JobMonitoring.JobOrderStarted`, tells the events of a topic apart. | MQTT keeps the order of messages only within one topic. On one topic `JobOrderStarted` and the `JobOrderResultChanged` that follows arrive in the order they came up; between two groups, such as a job order and its program execution, only `time` orders them. One subscription per group is enough; `machines/+/events/+` gets them all. |
| CloudEvent | `specversion` `1.0`; `id` a UUID, the same when the event goes out again; `source` the `ProductInstanceUri` of the machine, as a valid URI reference; `type` the path of the event; `time` its source time; `sequence` the start of the adapter (`yyyyMMddTHHmmssZ`), a dot and a count of twelve digits that counts the events of the machine within their group (`JobMonitoring`, `WorkMasterMonitoring`, `Notification`), from 1 and without a gap: one count per topic of events; `correlationid` the `ExecutionId` on the events of a program execution, and on an alert or notification that came up in one; `dataschema` the event schema of the model version; `data` the flat struct of the event. A new start of the adapter begins a new prefix and counts from 1 again. | A consumer finds a duplicate by `source` and `id`, and a gap by the count in `sequence`, in any technology; a comparison of strings orders the events of a group. After a gap or a new prefix it reads the state again: `JobMonitoring.JobOrders` and `JobMonitoring.JobOrderResults` after a gap in `JobMonitoring`, `WorkMasterMonitoring.ProgramExecution` after a gap in `WorkMasterMonitoring`, `Notification.ActiveAlerts` after a gap in `Notification`. |
| Delivery | QoS 1, not retained. | QoS 1 delivers at least once; a duplicate is caught by `id`. A retained event would be a state, and a state is a value. |
| Outbox | While the broker is away the adapter keeps the events in the order they came up and sends them after the next connect, with their source time and their `id`. The outbox is bounded; when it is full the oldest event is dropped and logged, and its count stays a gap in `sequence`: nothing is numbered again. Values need no outbox, every connect publishes them whole. | Without an outbox the events of a broker outage are lost unnoticed. |
| Consumer | A consumer that keeps events subscribes with a persistent session: Clean Start false, a session expiry of for example 24 hours, QoS 1. Several instances of one consumer share the events with a shared subscription, `$share/<group>/machines/+/events/+`. | The broker holds the events while the consumer restarts. |

| Group of events (first segment of `type`) | Topic below `machines/{MachineId}/events/` |
|---|---|
| `JobMonitoring` | `jobs` |
| `WorkMasterMonitoring` | `workmasters` |
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
- A job order and its result are two lists, as in ISA-95: `JobMonitoring.JobOrders`, what is ordered
  (`JobOrderID`, `State`, `StateSince`, `JobName`, `WorkMasterID`, `OrderNumbers`, `RunsPlanned`,
  `JobExecutionMode`, `PlannedStartTime`, `PlannedEndTime`), and `JobMonitoring.JobOrderResults`, what comes of
  it (`JobOrderID`, `StartTime`, `EndTime`, `ProducedQuantity`, `GoodQuantity`, `RunsCompleted`,
  `ActualProductionTime`, `JobResult`). Every field is always there: `EndTime` is `null` until the end,
  `JobResult` `Unknown` until the end, a planned time `null` when the machine does not know it. A result comes
  with `JobOrderStarted` and goes with `JobOrderRemoved`; it has no events of its own for that. A job order that
  never started, a cancelled one too, has no result.
- The events of a job order carry its entry, `JobOrderResultChanged` the entry of its result. `JobOrderChanged`
  comes only without a change of state, when another field of the job order changes, such as `RunsPlanned`;
  `JobOrderResultChanged` when the result changes, a quantity, its end. A field that keeps running, such as
  `ActualProductionTime`, does not bring one on its own; an event carries its value at the moment of the change.
  A job order taken back before it started leaves with `JobOrderRemoved`, without a change of state.
- Whoever needs the current state reads the value, not the events.
- `sequence` belongs to the model: every event carries it, counted from 1 per machine and group. The manifest
  names every event as `{path, correlationId}`; `correlationId: true` says the adapter sends `correlationid`
  where the event belongs to a program execution.
- The fields of an alert, in `Notification.ActiveAlerts` and in every alert event, are `Id`, `ErrorCode`,
  `Message`, `Severity` (the category after NAMUR NE 107), `SeverityValue` (a number from 1 to 1000), `Time`
  (since when it stands) and `SourceName`, and `correlationId` where it came up in a program execution. A
  `Notification.NotificationEvent` is a message that does not stay, an alert without `Severity`.

### Manifest and connection

- The manifest is retained and comes before the values. It names the model version, the profiles, the
  heartbeat interval, the retention of ended job orders (`jobOrderRetention`), the instances, every element and
  every event.
- `Connection/State` is the state of the adapter, after ServerState of OPC UA: `Initializing`, `Running`,
  `CommunicationFault`, `Shutdown`. After its start the adapter sends `Initializing`, then the manifest and every
  value, and only then `Running`. So `Running` never stands over values of an earlier run. On a reconnect to the
  broker it sends the manifest and every value again, then `Running`, without a second `Initializing`.
- When the adapter cannot reach the machine it sends `CommunicationFault`. The values stand with their source
  time, neither `null` nor deleted, but they are not current; only the heartbeat keeps coming. When it reaches the
  machine again, it sends every value anew and then `Running`. A clean stop sends `Shutdown`, the last message.
- Whether the adapter lives says only `Connection/Heartbeat`. The model needs no last will; this binding keeps
  one as a quicker sign: `Connection/State` = `CommunicationFault`, retained, with the time of the connect. The
  model has no value for an adapter that is gone (see "Open for the hackathon").

### Units

Exactly those of the catalogue: energy in `wattHour`, a temperature in `degreeCelsius`. The stores keep them as
they came and convert nothing. Places below `sites/` keep the coherent SI units of [ADR-0002](../../docs/adr/0002-si-units-joule-and-one.md).

### Signals of the manufacturer

The signals the machine manufacturer defines lie in the same tree as the elements of the model, in the namespace
`oem`:

- In the model a signal of the manufacturer begins with exactly one prefix segment `x-<domain>`, the internet
  domain of the manufacturer with `-` for every dot (rule for names of the model). The manifest lists it so,
  for example `x-alcyone-machines-example.Spindle.1.BearingTemperature`, with its `type` and, for a number, its `unit`
  (`code` and `name`) and a `description`.
- The binding maps `x-<domain>.<path>` to `oem/<path>`: the prefix segment is left out, the rest of the path
  becomes topic levels. `x-alcyone-machines-example.Spindle.1.BearingTemperature` lies on
  `machines/alcyone-machines_AX-400_P-04/oem/Spindle/1/BearingTemperature`, at the same place of the tree as
  `machines/alcyone-machines_AX-400_P-04/umati/Spindle/1/IsRotating`, only in another namespace. The domain of the manufacturer stands
  only in the manifest; back from the topic, the manifest gives the full path. An element of the model never lies
  outside `umati`, a signal of the manufacturer never in `umati`.
- It has the same envelope as an element of the model, `{timestamp, value, unit}`, retained, QoS 1. The `unit` is
  the `name` the manifest gives; the value follows the rules of the model for units, a temperature in
  `degreeCelsius`, energy in `wattHour`.
- A consumer ignores what it does not know (must-ignore). One that knows only the model subscribes to
  `machines/+/umati/#`.

### What the simulators publish

Every simulator of the demo stack publishes this tree, as client `<ClientId>` with its last will on
`machines/{MachineId}/umati/Connection/State`. A virtual machine of its own, a state machine driven by a scenario in the
configuration (`Config:SpecOutput`), produces every value and event, so they agree with each other.
`Config:SpecOutput:ScenarioName` picks the scenario from `Config:SpecOutput:Scenarios`; without a name the
simulator runs `Config:SpecOutput:Scenario`.

| Simulator | Topics below | Scenario | Jobs | Profiles | Signals of the manufacturer |
|---|---|---|---|---|---|
| P-04 | `machines/alcyone-machines_AX-400_P-04/` | default | shafts, flanges, bushings; cycles of 45 s to 90 s, up to 15 kW | all of the list below | `oem/Spindle/1/BearingTemperature`, `oem/WorkMasterMonitoring/ActiveProgram` |
| P-07 | `machines/taygeta-precision_TP-800_P-07/` | `housings` | housings, cover plates, gearbox housings; cycles of 2.5 min to 7 min, up to 21 kW | all of the list below | `oem/Spindle/1/BearingTemperature`, `oem/WorkMasterMonitoring/ActiveProgram` |
| M-02 | `machines/merope-microtec_MM-120_M-02/` | `small-parts` | pins, spacers, nozzles in large quantities; cycles of 20 s to 50 s, up to 7 kW | all of the list below | `oem/Spindle/1/BearingTemperature`, `oem/WorkMasterMonitoring/ActiveProgram` |

The manufacturers are made up, named after the Pleiades; each simulator has its own:

| Simulator | `Manufacturer` | `ManufacturerUri` | `Model` | Machine id | `ProductInstanceUri` |
|---|---|---|---|---|---|
| P-04 | Alcyone Machine Works | `https://www.alcyone-machines.example` | `AX-400` | `alcyone-machines_AX-400_P-04` | `https://www.alcyone-machines.example/AX-400/P-04` |
| P-07 | Taygeta Precision | `https://www.taygeta-precision.example` | `TP-800` | `taygeta-precision_TP-800_P-07` | `https://www.taygeta-precision.example/TP-800/P-07` |
| M-02 | Merope Microtec | `https://www.merope-microtec.example` | `MM-120` | `merope-microtec_MM-120_M-02` | `https://www.merope-microtec.example/MM-120/M-02` |

The domains end in `.example`, reserved for examples (RFC 2606), so none belongs to anyone. Each manufacturer
names its signals with its own prefix: `x-alcyone-machines-example`, `x-taygeta-precision-example`,
`x-merope-microtec-example`. The tree below `machines/` publishes no manufacturer and stays as it is.

All three are machine tools with one channel and one spindle and declare the same profiles: `Core`,
`IdentificationExtended`, `Components`, `MonitoringExtended`, `ChannelMonitoring`, `Spindle`, `Stacklight`,
`EnergyElectricity`, `JobMonitoring`, `WorkMasterMonitoring` and `AlertsEvents`. A declared profile is delivered
whole: every element and event of it is in the manifest, and what the machine lacks says `"available": false`.
Of `IdentificationExtended` the virtual machine delivers `MonthOfConstruction`, `InitialOperationDate` and
`DeviceClass`; `HardwareRevision`, `AssetId`, `ComponentName` and `Location` are `"available": false`.
`EnergyCompressedAir` is not declared: the virtual machine has no compressed air. Each scenario has its own alerts, job order numbers and
counters. The signals of the manufacturer, derived from the virtual machine, are published in the namespace
`oem`.

Each virtual machine works like this:

- The machine works through job orders: set up, then one program execution per part, until the quantity is
  made. Each program execution has a new `ExecutionId`. Its snapshot carries `State` and `StartTime` and stays
  with `Ended` or `Aborted` until the next one begins; it is `null` only before the first.
- Now and then a running program stops on its own, a programmed halt (`Scenario:ProgramStopsPerHour`): the
  program execution is interrupted and resumed, the job order keeps running. The stop gives a
  `Notification.NotificationEvent` to the operator (`Scenario:ProgramStopCode`, `ProgramStopText`) with the
  `ExecutionId` as `correlationid`.
- Now and then the planner changes a waiting job order (`Scenario:QueueChangesPerHour`): it revokes its release,
  cancels it (`JobOrderCancelled`: aborted without having run, so without a result), takes it back
  (`JobOrderRemoved`) or changes the runs it plans (`JobOrderChanged`).
- A job order names its work master (`WorkMasterID`), the same id as `WorkMasterMonitoring.ActiveWorkMaster`
  while it runs, an order number of the ERP (`OrderNumbers`, `SO-` and its number), its runs (`RunsPlanned`, the
  quantity of the job) and `ProductionMode`; the machine knows no planned times. Its result counts one run per
  part made; `JobResult` is `Successful` at its end, `Unsuccessful` when a failure aborts it.
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
- The program execution snapshot (`umati/WorkMasterMonitoring/ProgramExecution`) carries, from its end until the next
  program execution begins, the sums `Duration`, `PartsProduced` and `EnergyElectricity`, the same as its end
  event. `EnergyCompressedAir` is left out: the virtual machine has no compressed air.
- Each job of a scenario names its work master, an id of its own such as `WM-SHAFT-4711`
  (`Scenario:Jobs:WorkMaster`; without one, `WM-` and the name of the program). It is
  `WorkMasterMonitoring.ActiveWorkMaster`, `ActiveWorkMaster` in the snapshot and the events of a program
  execution, and `WorkMasterID` of its job order. The NC program that carries it out (`Scenario:Jobs:Program`,
  such as `SHAFT_4711.MPF`) has no element in the model; the virtual machine publishes it as a signal of the
  manufacturer, `x-alcyone-machines-example.WorkMasterMonitoring.ActiveProgram` on `oem/WorkMasterMonitoring/ActiveProgram`,
  and nowhere else.
- Each scenario names its machine: `Model`, `ProductCode`, `YearOfConstruction`, `MonthOfConstruction`,
  `InitialOperationDate`, `DeviceClass`, and its manufacturer: `Manufacturer` and `ManufacturerUri`, whose domain
  without `www.` forms the prefix of its signals. `ProductInstanceUri` is `{ManufacturerUri}/{Model}/{SerialNumber}`
  unless set. The model has no software revision of the whole machine: `Components.Software` lists the revision
  of each component (`Manufacturer`, `ComponentName`, `SoftwareRevision`; `Manufacturer` and `ComponentName` name
  an entry), all of them of the manufacturer of the machine: NC kernel, PLC, HMI and a fourth component of each
  scenario (`Scenario:Software`).
- The stack light is `Segmented`. P-04 and P-07 have four lamps, M-02 three (`Scenario:StacklightLamps`):

  | `NumberInList` | `SignalColor` | P-04 | P-07 | M-02 |
  |---|---|---|---|---|
  | 0 | `Red` | yes | yes | yes |
  | 1 | `Yellow` | yes | yes | yes |
  | 2 | `Green` | yes | yes | yes |
  | 3 | `Blue` | yes | yes | no |

  The lamps follow the state of the virtual machine; several may shine at once. This mapping is an assumption of
  the emulator; the model prescribes none:

  | State of the machine | Lamp | `SignalMode` |
  |---|---|---|
  | an alert `Failure` stands | Red | `Continuous` |
  | an alert `OffSpec` or `CheckFunction` stands | Yellow | `Blinking` |
  | an alert `MaintenanceRequired` stands | Blue (M-02: Yellow) | `Continuous` (M-02: `Flashing`) |
  | the program is interrupted | Green | `Blinking` |
  | a program runs (`Executing`) | Green | `Continuous` |
  | the machine is set up (`Setup`) | Yellow | `Continuous` |
  | it waits for the operator: a job order ended or none is released | Blue (M-02: Yellow) | `Blinking` |
  | the machine is off (`NotAvailable`) | none | every `SignalOn` `false` |

  A lamp takes the first row that applies to it, so an alert comes before the state. A lamp that is off keeps its
  colour and says `Continuous`. The whole list goes out, retained, whenever a lamp changes; the stack light has no
  events. Only the mode `Blinking` is reported, not each on and off. The virtual machine is never off; that row
  is there for an adapter that sees one.
- Channel 1 has the feed override of the machine, `ChannelMode` `Automatic`, and `JogManual` while it is set up,
  a rapid override of 1 and the name `CHAN1`; spindle 1 is not used as an axis and is named `S1`.
- `OperationCounters.OperationDuration` grows while a program runs. A scenario may let the machine warm up after
  its start (`Scenario:WarmUpTime`, zero by default): meanwhile `State.IsWarmUp` is `true` and no job order starts.
- A scenario may let the adapter lose the machine now and then (`Scenario:CommunicationFaultInterval`, off by
  default; `CommunicationFaultDuration`, 1 minute): at the end of every interval `Connection/State` is
  `CommunicationFault` for that long, only the heartbeat goes out, and the events of the machine meanwhile are
  lost, a gap in `sequence`. Then every value comes anew and `Running`.
- A scenario may name elements the machine lacks for good (`Scenario:Unavailable`): any element but the five every
  adapter delivers (`Connection.Heartbeat`, `Connection.State`, `Identification.Manufacturer`, `SerialNumber`,
  `ProductInstanceUri`). Such an element is published once with `value: null` and named in the manifest with
  `"available": false`; without `ActiveAlerts` there are no alert or notification events either. By default
  nothing is unavailable.
- The counters (power-on duration, operation duration, energy, parts) only grow; they are kept in `/data` across
  restarts.
- Its signal of the manufacturer, the temperature of the spindle bearing, warms towards a running temperature
  while the spindle turns (scaled by the spindle override) and cools back while it stands
  (`Scenario:BearingTemperatureIdle`, `BearingTemperatureRunning`, `BearingTimeConstant`).
- The events wait in an outbox of 10 000 while the broker is away (`Config:SpecOutput:EventBufferSize`).
  The prefix of `sequence` is the start of the simulator; the `id` of an event is a UUID made from the
  `ProductInstanceUri`, the group and the `sequence`, so it stays the same when the event goes out again.

| Path below `machines/{MachineId}/` | Kind | Unit |
|---|---|---|
| `umati/Manifest` | manifest | – |
| `umati/Identification/Manufacturer`, `umati/Identification/SerialNumber`, `umati/Identification/ProductInstanceUri`, `umati/Identification/Model`, `umati/Identification/ManufacturerUri`, `umati/Identification/ProductCode`, `umati/Identification/DeviceClass` | string | – |
| `umati/Identification/YearOfConstruction`, `umati/Identification/MonthOfConstruction` | integer | – |
| `umati/Identification/InitialOperationDate` | date and time | – |
| `umati/Identification/HardwareRevision`, `umati/Identification/AssetId`, `umati/Identification/ComponentName`, `umati/Identification/Location` | `null`, `"available": false` | – |
| `umati/Components/Software` | list: `Manufacturer`, `ComponentName`, `SoftwareRevision` | – |
| `umati/Connection/State` | enum: `Initializing`, `Running`, `CommunicationFault`, `Shutdown` | – |
| `umati/Connection/Heartbeat` | integer | – |
| `umati/State/Status` | snapshot | – |
| `umati/State/FeedOverride` | number | `one` |
| `umati/State/IsWarmUp` | boolean | – |
| `umati/Channel/1/ChannelState` | enum, `correlationId` | – |
| `umati/Channel/1/FeedOverride`, `umati/Channel/1/RapidOverride` | number | `one` |
| `umati/Channel/1/ChannelMode` | enum | – |
| `umati/Channel/1/Name` | string | – |
| `umati/WorkMasterMonitoring/ActiveWorkMaster` | string, the id of the work master, `correlationId` | – |
| `umati/WorkMasterMonitoring/ProgramExecution` | snapshot with `State`, `StartTime` and, after the end, the sums | – |
| `umati/JobMonitoring/JobOrders` | list: what is ordered | – |
| `umati/JobMonitoring/JobOrderResults` | list: what comes of it, an entry from the start | – |
| `umati/OperationCounters/PartsProducedInLifetime` | integer | `piece` |
| `umati/OperationCounters/PowerOnDuration`, `umati/OperationCounters/OperationDuration` | number | `second` |
| `umati/Notification/ActiveAlerts` | list | – |
| `umati/Spindle/1/IsRotating`, `umati/Spindle/1/IsUsedAsAxis` | boolean | – |
| `umati/Spindle/1/Override` | number | `one` |
| `umati/Spindle/1/Name` | string | – |
| `umati/Stacklight/StacklightMode` | enum: `Segmented` | – |
| `umati/Stacklight/StackElement` | list: `NumberInList`, `SignalOn`, `SignalColor`, `SignalMode` | – |
| `umati/Consumption/Electricity/Main/AcActivePowerTotal` | number | `watt` |
| `umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp` | number | `wattHour` |
| `oem/Spindle/1/BearingTemperature` | number, signal of the manufacturer (`x-alcyone-machines-example.Spindle.1.BearingTemperature` in the manifest) | `degreeCelsius` |
| `oem/WorkMasterMonitoring/ActiveProgram` | string, signal of the manufacturer (`x-alcyone-machines-example.WorkMasterMonitoring.ActiveProgram`): the NC program of the active work master | – |
| `events/jobs` | CloudEvents `JobMonitoring.JobOrder<Added, Released, Revoked, Started, Interrupted, Resumed, Ended, Aborted, Cancelled, Changed, ResultChanged, Removed>` | – |
| `events/workmasters` | CloudEvents `WorkMasterMonitoring.ProgramExecution<Started, Interrupted, Resumed, Ended, Aborted>` | – |
| `events/notifications` | CloudEvents `Notification.AlertRaised`, `Notification.AlertChanged`, `Notification.AlertCleared`, `Notification.NotificationEvent` | – |

The tests of the simulator check every message against the JSON schemas of the model when a clone of it lies
next to this repository, or in the folder named by `UMATI_DATAMODEL_DIR`; without one they are skipped.

### What the adapters of real devices publish

Three adapters bring real devices into the stack with the same binding: the first two each in a Compose profile of
its own, the third with the stack:
the [Ultimaker telemetry](../ultimaker/telemetry.md), the
[juice bar](../../source/Pleiades.Playground.JuiceBar.Api/README.md) and the
[cutting adapter](../../source/Pleiades.Playground.Cutting.Adapter/README.md), one per cutting machine. They publish with the same code as the
simulators (`Pleiades.Playground.Mqtt.Extensions.Machines`): every value retained with QoS 1 in the envelope
above, the manifest before the values, `Connection/State` `Initializing`, `Running`, `CommunicationFault` while the
device does not answer and `Shutdown` at a clean stop, every value again after a reconnect or when the device
answers again, and the last will. Unlike a simulator they see the device only from outside, and a value goes out when it changes. The time of a value
is the time the adapter read it (`"timestampSource": "adapter"`), unless the device gives one, as a cutting
machine does.

| Adapter | Topics below | `ManufacturerUri` | Prefix of its signals | Profiles |
|---|---|---|---|---|
| Ultimaker telemetry | `machines/ultimaker_UM3_UM3-01/` | `https://ultimaker.com` | `x-ultimaker-com`, on `oem/Ultimaker/…` | `Core` |
| Juice bar | `machines/trumpf_JuiceBar_JUICEBAR-01/` | `https://www.trumpf.com` | `x-trumpf-com`, on `oem/JuiceBar/…` | `Core` |
| Cutting adapter | `machines/trumpf_Laser2D_L-01/`, `trumpf_Tube_T-01/`, `trumpf_Punch_PU-01/` | `https://www.trumpf.com` | `x-trumpf-com`, on `oem/WorkMasterMonitoring/ActiveProgram` | `Core` |
| Bending adapter | `machines/trumpf_5085_AE325085TB46/` | `https://www.trumpf.com` | `x-trumpf-com`, on `oem/WorkMasterMonitoring/ActiveProgram`, `oem/Rci/…`, `oem/Production/…` | `Core` |

Each delivers of `Core` the identification, the connection and `State/Status`, with `MachineryOperationMode`
`None`, the value of the model for a machine without operation modes; `ProductCode`, `YearOfConstruction`
and `OperationCounters.PowerOnDuration` are `"available": false`. Printer and juice bar do not deliver
`State.FeedOverride` and `Notification.ActiveAlerts` either, and publish no events. The cutting adapter delivers
both, besides `Channel/1/ChannelState` and `WorkMasterMonitoring/ActiveWorkMaster`, which carries the name of the NC program, the same value as its signal: the machine has no work master of its own; its timestamps are those of the machine (`"timestampSource": "source"`), save a `null` for not known, which carries the time of the connect,
and each alarm of the machine is an entry of `ActiveAlerts` with the events `Notification.AlertRaised` and
`Notification.AlertCleared` on `events/notifications`. The protocol of the cutting machines has no request for
the current alarms, so after a start of the adapter `ActiveAlerts` is `null` until the machine runs, stands
without a fault or names an alarm; the list goes out before the events that change it.

The [bending adapter](../../source/Pleiades.Playground.Bend.Adapter/README.md), one per press brake that reports through RCI
telegram files, delivers `ActiveAlerts` with the same two events for a fault of the machine, and an operator message
or a finished order as `Notification.NotificationEvent`; its timestamps are those of the machine as well, and the RCI
operating state offline is `CommunicationFault`. RCI has no handshake and no request for the current state: the
adapter reports `Running` as soon as it reads the exchange folder, while `State/Status` and `ActiveAlerts` stay
`null` until the machine reports its first operating state; the list goes out before the events that change it.

The [OPC UA adapter](../../source/Pleiades.Playground.OpcUa.Adapter/README.md) brings in every machine a person
adds in the chat, with the same publisher and one MQTT connection per machine, so that each has its own last
will (client id `opcua-adapter-<machineId>`). What it publishes follows from the registration of the machine:

- The machine id is formed from `Identification.ManufacturerUri`, `Model` and `SerialNumber` as the server gave
  them when the machine was added, and kept with the registration. A server without a node for
  `ManufacturerUri` gets `Identification.Manufacturer` without its special characters in its place, published
  as `ManufacturerUri` (see [Without a ManufacturerUri](#without-a-manufactureruri)).
- The manifest declares the core whole, what the machine lacks `"available": false`, and the other profiles
  whose elements the registration maps whole. A value of the maker is a signal of the manufacturer, below
  `oem/`, with the prefix of the domain of its `ManufacturerUri`, or of the stand-in.
- A value goes out when the server reports a change, with the time of the source (`"timestampSource":
  "source"`), in the unit of the catalogue. `State.Status` is built from the two fields of the state.
- `Connection/State` is `Running` while the OPC UA session stands and `CommunicationFault` while it does not.
- The alarms of the server are `Notification.ActiveAlerts` and the events `Notification.AlertRaised` and
  `Notification.AlertCleared` on `events/notifications`. A machine in `urn:umati2:datamodel:opcua` gives them as
  its list `Notification.ActiveAlerts`, with the category of NE 107 in `Severity`, which the adapter keeps. From an
  alarm event `Severity` is the category from the severity of OPC UA (from 667 `Failure`, from 334 `OffSpec`,
  below `MaintenanceRequired`), an assumption of the adapter.
  `sequence` counts from 1 in every run of the adapter; the outbox holds the events while the broker is away, as
  the managed client keeps every message. An alarm that stood before a restart of the adapter and still stands is
  raised once more in the new run, with its `Id` and its `Time`, so that every run names the alarms that stand.
- When a machine is removed, the adapter takes every retained message of it back with an empty one and ends its
  connection without its last will. While the broker cannot be reached it does not remove the machine.

### Open for the hackathon

- A version level in the topic: proposed no, the version is in the manifest.
- The machine id in the topic. This binding proposes `<manufacturer>_<model>_<serial number>` (see "Machine
  id"), unique across manufacturers as long as a manufacturer gives a serial number once per model; globally
  unique stays `ProductInstanceUri` (open question 4 of the model). The manifest names it as `machineId`, a field
  the schema of the manifest of the model does not know: it passes the schema only once `machineId` is taken off,
  as `unit` from a value. Persistence, APIs, app and genui-mcp name a machine by this id.
- The order of the lamps. The model takes `NumberInList` from OPC 10000-200, which counts from the base of the
  stack light; here 0 is red, the lamp at the top of a usual machine tool. Either the list or the counting has to
  change once the group decides.
- The namespace level, the mapping of the prefix `x-<domain>` to `oem`, and the reserved names `umati`, `oem`
  and `events` are proposals of this binding. With one namespace `oem`, two manufacturers below one machine would
  share it; their paths must then differ.
- The topic of each group below `events/` (`jobs`, `workmasters`, `notifications`) is in the model since 0.17.1;
  the outbox and the persistent session of a consumer are proposals of this binding. The model counts `sequence` per group, so that a gap on a topic is a gap in the number; a router that
  reads `sequence` over the whole `source`, as the CloudEvents extension does, sees jumps between the groups.
- The last will. The model needs none and has no value for an adapter that is gone, since `Disconnected` is no
  more. This binding keeps the last will and sets `CommunicationFault`, the value that comes closest: the values
  stand, they are not current. Strictly it means "the adapter runs but does not reach the machine", which a
  broken connection of the adapter does not say. Open: a last will with `CommunicationFault`, a value of the
  binding of its own, or no last will at all.
- The work master. The virtual machine sends a work master id of its own (`WM-SHAFT-4711`) and the NC program
  only as a signal of the manufacturer, `oem/WorkMasterMonitoring/ActiveProgram`; the model has no element for the
  program, and its catalogue still says the work master of a machine tool is mostly the name of the NC program.
  Open: whether the model wants an element for the program (for example in `ProgramExecution`), or the work master
  stays the program name on machines without a work master of their own. The cutting adapter does the latter.
- Programs and jobs of the cutting machines. The model has `WorkMasterMonitoring.ProgramExecution` with the
  events `ProgramExecutionStarted`, `Ended`, `Aborted`, `Interrupted` and `Resumed`; `StartNCP`, `EndeNCP`,
  `ResetNCP` and the halts the cutting adapter detects map onto them almost one to one, and the production plan
  (`PRD_SHOW`) could become `JobMonitoring.JobOrders`. Then the cutting machines would show up in the job and
  program views of the app like the virtual machine. Open: who builds it.
- The planned times of a job order. The model asks for `PlannedStartTime` and `PlannedEndTime` and allows `null`;
  the virtual machine knows no plan and sends `null`. `OrderNumbers` is made up (`SO-` and the number of the job
  order).
- The mapping of states to lamps. It is an assumption of the emulator, as in the table above; whether the group
  wants a recommendation, as NE 107 for alerts, is open.
- The events below `machines/` follow the profiles too: job events (`events/jobs`) carry the job order and its
  result in one, as `JobOrderResultChanged` with the action `ResultChanged`; work master events
  (`events/workmasters`) carry the program executions.
- During a `CommunicationFault` the virtual machine runs on and its events are lost; the gap shows in `sequence`.
  A real adapter that does not see the machine numbers no events it does not see, so it has no gap; it only has
  `CommunicationFault` and `Running` to tell its consumers to read the state again.
- When a job order turns `Running`: at the start of the setup, as here, or at the first program execution.
- Whether an MQTT 5 user property names the kind of a message (value, event, manifest).
- `Connection.Heartbeat` is an integer without a unit in the catalogue, while the binding asks for a unit with
  every number. The simulator sends none.
- The numbers inside snapshots, list entries and events (`ProducedQuantity`, `Duration`, `EnergyElectricity`)
  carry no unit on the wire; their unit is only in the catalogue.
- The schema of the runtime values rejects every field besides `value`, `timestamp` and `correlationId`, so an
  envelope with `unit` passes it only once `unit` is taken off again.
- The timestamp of the last will is the time of the connect: the broker publishes it as it was set then.
