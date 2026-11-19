# Pleiades.Playground.Bend.Adapter

Reads one bending machine over its RCI telegram files, as its host, and publishes what the machine says to the MQTT
broker, in the names of the data model. From there the stack stores it. The example app, the chat and every tool then
show the machine like any other.

Source of the values: the machine itself, through its telegram files `RCIMaschToServ<n>.xml` (RCI interface
description, chapter 4.2, not part of this repository; the format is in the
[protocol](../Pleiades.Playground.Bend.Protocol/README.md)). In this repository that is the
[bending simulator](../Pleiades.Playground.Bend.Simulator/README.md), which produces test data only. Against a real
machine, the values belong to its operator. No key is needed.

> **Status: proposal.** The signals of the manufacturer below `oem/` and the mapping of the RCI operating state are
> not agreed yet. They are proposed in an issue and can be merged once the maintainers have agreed.

## Run it

With the simulator, one adapter per machine, both start with the stack:

```sh
docker compose up -d --build --wait
```

| Adapter | Machine | Machine id on the broker |
|---|---|---|
| `bending-adapter-press` | `bending-press` | `trumpf_5085_AE325085TB46` |

The adapter mounts the exchange folder of its machine at `/exchange`, read only: it neither deletes nor moves a file,
so a host such as Oseon can read the same folder. Without Docker, from this folder, next to a running simulator:
`dotnet run --launch-profile BendingPress`. A second machine is a copy of both services with names, values, volumes and
an MQTT client id of its own.

The RCI telegrams carry neither serial number, manufacturer nor model: in compose they stand at the simulator, and the
adapter takes them from there (YAML anchors). The web address of the manufacturer, `Config__ManufacturerUri`, stands at
the adapter.

## Topics

The adapter publishes the [binding of machines](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model)
(data model 0.17.1) with the publisher the simulators and the other adapters share
(`Pleiades.Playground.Mqtt.Extensions.Machines`): below `machines/{MachineId}/`, the machine id
`<manufacturer>_<model>_<serial number>`, the first part the domain of `ManufacturerUri` without `www.` and its ending.
Every value is retained with QoS 1 in the envelope `{timestamp, value, unit}`, the manifest comes before the values,
and a value goes out when it changes.

| Topic | Kind | Unit | From the RCI message |
|---|---|---|---|
| `umati/Manifest` | manifest | – | Profile `Core`, the elements and signals below, the three events |
| `umati/Identification/…` | string | – | `Manufacturer`, `ManufacturerUri`, `Model`, `SerialNumber`, `ProductInstanceUri` from the configuration |
| `umati/Connection/State` | string | – | The state of the adapter: `Initializing`, `Running`, `CommunicationFault` while the operating state is offline (3), `Shutdown`; the last will is `CommunicationFault` |
| `umati/Connection/Heartbeat` | integer | – | Counts up every 10 s while the adapter runs |
| `umati/State/Status` | snapshot | – | `MachineryItemState` and `MachineryOperationMode` from `OperatingStateFeedback`, see below |
| `umati/Notification/ActiveAlerts` | list | – | The fault that stands, see below; `[]` for none; `null` until the first operating state |
| `umati/WorkMasterMonitoring/ActiveWorkMaster` | string | – | The work master, for RCI the `ProgramName` of the order (the catalogue: for a machine tool mostly the name of the program); `null` after `ProcessingStopped` and while offline. The example app shows it as the program |
| `oem/WorkMasterMonitoring/ActiveProgram` | string | – | `ProgramName` of the order of `ManufacturingOrderFeedback`, `ProcessingStarted`; `null` after `ProcessingStopped` (finished or paused) and while offline |
| `oem/Rci/OperatingState` | integer | `one` | The RCI operating state as it is: -1, 0, 1, 2, 3 |
| `oem/Production/ActiveOrderNo` | string | – | `OrderNo` of the order |
| `oem/Production/ActiveProductionPackage` | string | – | Name of the production package |
| `oem/Production/ActivePartNo` | string | – | `PartNo` of the order |
| `oem/Production/ProcessedParts` | integer | `one` | `ProcessedParts` of the order |
| `oem/Production/DesiredParts` | integer | `one` | `DesiredNumberOfParts` of the order |
| `oem/Production/ScrapParts` | integer | `one` | `ScrapParts` of the order |
| `oem/Production/PackageProcessedQuantity` | integer | `one` | `ProcessedQuantity` of `ProductionPackageFeedback/Started/Stopped` |
| `oem/Production/PackageDesiredQuantity` | integer | `one` | `DesiredQuantity` of the same |
| `events/notifications` | CloudEvents | – | `Notification.AlertRaised`, `Notification.AlertCleared`, `Notification.NotificationEvent`, see below |

The signals below `oem/` are named in the manifest with the prefix of the manufacturer, for example
`x-trumpf-com.Rci.OperatingState`; the data model has no element for them. `ProductCode`, `YearOfConstruction`,
`State.FeedOverride` and `OperationCounters.PowerOnDuration` of `Core` are `"available": false`: RCI does not give them.

| RCI operating state | `MachineryItemState` | `MachineryOperationMode` | `Connection/State` |
|---|---|---|---|
| 1 running (`LAEUFT`) | `Executing` | `Processing` | `Running` |
| 0 idle (`STEHT`) | `NotExecuting` | `Processing` | `Running` |
| 2 maintenance (`WARTUNG`) | `OutOfService` | `Maintenance` | `Running` |
| -1 fault (`STOERUNG`) | `OutOfService` | `Processing` | `Running` |
| 3 offline | `NotAvailable` | `None` | `CommunicationFault` |

Events, CloudEvents 1.0 on `machines/{MachineId}/events/notifications`, QoS 1, not retained, numbered in
`sequence` (the start of the adapter and a count in the group `Notification`). While the broker is away, or the
machine is offline, they wait and go out after the values and `Running`.

- Fault: operating state -1 makes an alert with `ErrorCode` `RCI-<ErrorNo>`, the `ErrorText` as `Message` and the
  `Severity` `Failure` (NAMUR NE 107; RCI names none). It stands in `ActiveAlerts` and comes with
  `Notification.AlertRaised`; the next other operating state, or a fault with another number, clears it with
  `Notification.AlertCleared` and the same `Id`. The list goes out before the event that changes it.
- Finished order: a `Notification.NotificationEvent` `RCI-ORDER-FINISHED` once the processed parts of an order reach its
  desired number.
- `OperatorMessage`: a `Notification.NotificationEvent` `RCI-MESSAGE-<MessageNo>`.

Timestamps: those of the machine (`"timestampSource": "source"`), save a `null` for not known yet, which carries the
time of the start. An RCI timestamp is local time of the machine without an offset (`yyyy.MM.dd HH:mm:ss`); the
adapter converts it with `Config__MachineTimeZone` to UTC. A message without a timestamp gets the time the file was
written, one in the future the time of the adapter. Two values of one path in the same second keep their order: the
later one moves a millisecond on.

## Behaviour

- The folder is looked at every second. A file is read once it has not changed for 300 ms; a file that is
  not complete XML yet is read again at the next look. A file written again under the same name (a machine
  that counts from 1 after a restart) is read again.
- At the start, the files that are there already are read once, and only the newest value of each path is
  published, without events, so a restart does not repeat the history. A fault that stands is in `ActiveAlerts`.
- RCI has no handshake: the adapter cannot ask the machine whether it is there, and a machine writes a file only when
  something happens. So the adapter reports `Running` as soon as it reads the folder, even with no file in it, while
  `State/Status`, `ActiveAlerts` and the program stay `null`, not known, until the machine reports. `Running` says
  that the adapter reaches the folder, not that the machine runs.
- The machine counts as reached until it says it is offline (3); then the values stand with `CommunicationFault`.
  The next other operating state publishes what changed meanwhile and `Running` again.
- The RCI simulator reports the operating state only when it is set in its UI (MDE). Part feedbacks alone do
  not set `MachineryItemState`.

## Next to a real host

At a real press brake the host, for example TruTops or Oseon, reads `RCIMaschToServ<n>.xml` and removes it, often
within the second. The adapter only reads and looks every second, and waits 300 ms for a file to settle, so a file the
host takes earlier is never seen. Next to the simulator this does not happen: Oseon and the adapter read the same
folder, and the simulator keeps its files. Against a real machine the adapter needs a folder of its own that gets
every file, for example a copy job on the machine or the share that copies each new file into a second folder before
the host takes it, or a host that is set to keep its files. This was not tried against a real machine.

## Configuration

Section `Config` of `appsettings.json`, or the environment (`Config__SerialNumber` and so on). In compose, serial
number, manufacturer and model come from the simulator `bending-press` (YAML anchors).

| Setting | Default | Compose | Meaning |
|---|---|---|---|
| `SerialNumber` | (required) | `AE325085TB46` | `Identification.SerialNumber`, the last part of the machine id |
| `Manufacturer` | `TRUMPF` | `TRUMPF` | `Identification.Manufacturer` |
| `ManufacturerUri` | `https://www.trumpf.com` | `https://www.trumpf.com` | `Identification.ManufacturerUri`; its domain is the first part of the machine id and, with dashes, the prefix of the signals |
| `Model` | `Bend5130` | `5085` | `Identification.Model`, the middle part of the machine id |
| `ProductInstanceUri` | empty: `{ManufacturerUri}/{Model}/{SerialNumber}` | | The globally unique id of the machine, `source` of every event |
| `ExchangeDirectory` | `/exchange` | volume `bending-press-exchange`, read only | The folder of the telegram files, read only |
| `MachineFilePrefix` | `RCIMaschToServ` | | The name of the telegram files without the running number |
| `MachineTimeZone` | empty: that of the adapter | | The time zone of the RCI timestamps; set it for a real machine |
| `PollInterval` | `00:00:01` | | How often the folder is looked at |
| `HeartbeatInterval` | `00:00:10` | | How often the heartbeat counts up; the manifest names it |
| `MqttDestination__ConnectionString` | `mqtt://localhost:1883` | | The broker |

`/healthcheck` fails while the adapter is not connected to the broker; `/health` says that the process runs.
