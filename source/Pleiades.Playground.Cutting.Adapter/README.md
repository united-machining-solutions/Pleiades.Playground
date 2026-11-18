# Pleiades.Playground.Cutting.Adapter

Reads one cutting machine over its telegram files, as its host, and publishes what the machine says to the MQTT
broker, in the names of the data model. From there the stack stores it. The example app, the chat and every tool
then show the machine like any other.

Source of the values: the machine itself, through its telegram files (§2.2 of the interface specification of the
machine, which is not part of this repository). In this repository that is the
[cutting simulator](../Pleiades.Playground.Cutting.Simulator/README.md). Against a real machine, the values belong
to the operator of that machine, and the interface may first have to be enabled on it (§1.3).

## Run it

They start with the stack, one adapter per machine and its simulator:

```sh
docker compose up -d --build --wait
```

| Adapter | Machine | Machine id on the broker |
|---|---|---|
| `cutting-adapter-laser-2d` | `cutting-laser-2d` | `trumpf_Laser2D_L-01` |
| `cutting-adapter-tube` | `cutting-tube` | `trumpf_Tube_T-01` |
| `cutting-adapter-punch` | `cutting-punch` | `trumpf_Punch_PU-01` |

Each adapter mounts the volume of its machine at `/exchange`. Without Docker, from this folder, next to a running
simulator: `dotnet run --launch-profile Tube` (or `Laser2D`, `Punch`).

## What it publishes

The [MQTT binding of machines](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model), with the
publisher the other adapters of real devices share (`Pleiades.Playground.Mqtt.Extensions.Machines`): every value
retained with QoS 1 in the envelope `{timestamp, value, unit}`, the manifest before the values, the profile `Core`,
and the last will `Connection/State` = `CommunicationFault`. The machine id is `<manufacturer>_<model>_<serial
number>`, formed from `Config__ManufacturerUri`, `Config__Model` and `Config__SerialNumber`. Below
`machines/{MachineId}/`:

| Topic | Value | From the protocol |
|---|---|---|
| `umati/Manifest` | the manifest: `Core`, the elements below, the two alert events | at every connect to the broker |
| `umati/Identification/Manufacturer`, `SerialNumber`, `Model`, `ManufacturerUri`, `ProductInstanceUri` | from the configuration | at every connect to the broker |
| `umati/Connection/State` | `Initializing`, `Running`, `CommunicationFault`, `Shutdown` | `Running` after the reply to `SRC9CONN`; `CommunicationFault` before it, after `$$src9_server_disconnect$$`, after `$$src9_server_connect$$` until it answers again, or after no reply three times; `Shutdown` when the adapter stops |
| `umati/Connection/Heartbeat` | counts up | Every heartbeat interval, the sign of life of the adapter, whether the machine answers or not |
| `umati/State/Status` | `{MachineryItemState, MachineryOperationMode}`; `null` until the machine says its state. Channel and program, too, are `null` until the machine names them | |
| | `Executing` | `MaschineLaeuft` |
| | `NotExecuting` | `MaschineSteht`, reason 2 |
| | `OutOfService` | `MaschineSteht`, reason 1 (fault) |
| | `NotAvailable` | `$$src9_server_disconnect$$`: the machine switches off |
| | `MachineryOperationMode` `None` | The protocol knows no operation mode; `None` is the value of the model for that |
| `umati/State/FeedOverride` | percent ÷ 100, unit `one` | `Feedrate`; `MACHINFO` after connecting makes the machine send it (§6.4) |
| `umati/Channel/1/ChannelState` | `Active` | `StartNCP`; `MaschineLaeuft` after a halt |
| | `Interrupted` | `MaschineSteht`, reason 1 or 2, while a program runs: a halt |
| | `Reset` | `EndeNCP`, `ResetNCP` |
| `umati/WorkMasterMonitoring/ActiveWorkMaster` | the NC program, `null` when none runs: the machine has no work master of its own, so its work master is the program, as the catalogue of the model says of most machine tools | `StartNCP` field 2; `EndeNCP`, `ResetNCP` |
| `oem/WorkMasterMonitoring/ActiveProgram` | the NC program, `null` when none runs; a signal of the manufacturer (`x-trumpf-com.WorkMasterMonitoring.ActiveProgram`), as the simulators publish it | `StartNCP` field 2; `EndeNCP`, `ResetNCP` |
| `umati/Notification/ActiveAlerts` | the whole list: `Id`, `ErrorCode` (the alarm number), `Message`, `Severity` `Failure`, `Time`; `null` until the machine says whether an alarm stands. It goes out before the events that change it | `AktuelleAlarme`; `[]` on `MaschineLaeuft` or `MaschineSteht` reason 2 |
| `events/notifications` | CloudEvent `Notification.AlertRaised` | `AktuelleAlarme`, once per alarm number |
| | CloudEvent `Notification.AlertCleared`, the same `Id` | `MaschineLaeuft`, or `MaschineSteht` reason 2 |

`Identification.ProductCode`, `YearOfConstruction` and `OperationCounters.PowerOnDuration` are in the manifest with
`"available": false`: the protocol does not give them. The events carry `source` (the `ProductInstanceUri`) and a
`sequence` that counts from 1 per start of the adapter; while the broker is away they wait in a bounded outbox
(10 000, the oldest dropped first) and go out after the connect sequence. An alarm still raised when the machine
switches off or starts anew is cleared with it, and so is its program; one raised when the adapter itself restarts gets no `AlertCleared`: a consumer sees
the new start by the prefix of `sequence` and reads `ActiveAlerts` again. The protocol has no request for the
current alarms, and the machine names an alarm only when it comes up; so after a start of the adapter
`ActiveAlerts` is `null`, not known, until the machine runs, stands without a fault, or names an alarm.

**Halt or end?** The machine sends `MaschineSteht` whenever a program ends, is aborted or halts, and
`MaschineLaeuft` whenever one starts or goes on (§5.8, §5.9), often just before `EndeNCP` or `StartNCP`. So
the adapter holds both back for `Config__StateHold`. When a program notification comes in that time, the
state of the machine is published, but the channel shows no halt. Otherwise, the program halted. The values
keep the time the machine gave them; only their publication waits. A stop reason other than 1 or 2 is ignored,
and a start without an end, an end without a start and a re-entry (`StartNCP` field 8 = 1) go to the log: the
data model has no place for them.

A value is published when it changes, and every value again at each connect to the broker and when the machine
answers again; the app reads the last one, however old. While the machine does not answer, the values stand and
`Connection/State` says `CommunicationFault`; what it says meanwhile is kept and goes out with the next `Running`.

**Time.** The timestamps of the protocol have no time zone (§4). The adapter reads them in
`Config__MachineTimeZone` (an IANA id such as `Europe/Berlin`; empty: its own zone) and publishes UTC. A timestamp
in the future, or one it cannot read, becomes the time of receipt. The protocol counts whole seconds. When two
values of one topic share a second, the later one is moved one millisecond on, so that it stays the later one.

**Not published.** The production plan, orders, runtimes, tube allocations, pallets and stacks: the adapter
declares only the profile `Core`, and `JobMonitoring` would need the job orders of the machine, which the protocol
reports only in part.

## Connection (§2.5)

1. The adapter sends `SRC9CONN`. Without a reply it waits for `$$src9_server_connect$$`, and tries again at the
   latest after one heartbeat interval. It writes a new request only after the machine has read the last one,
   so the file does not grow while the machine is off.
2. Connected: `MACHINFO`, then `SYSTTIME` every heartbeat interval.
3. When the machine announces itself again, the adapter connects anew. When it stops, it sends `SRC9DISC`.

A reply with `-11` means that the machine has another number than `Config__MachineNumber`. The log says so.

## Configuration

| Key (`Config__…`) | Default | Meaning |
|---|---|---|
| `SerialNumber` | – | `Identification/SerialNumber`, the last part of the machine id |
| `Manufacturer` | `TRUMPF` | `Identification/Manufacturer` |
| `ManufacturerUri` | `https://www.trumpf.com` | `Identification/ManufacturerUri`; its domain without `www.` and its ending is the first part of the machine id, with dashes the prefix of the signals (`x-trumpf-com`) |
| `Model` | `Laser2D` | `Identification/Model`, the middle part of the machine id |
| `ProductInstanceUri` | empty | The globally unique id; empty for `{ManufacturerUri}/{Model}/{SerialNumber}` |
| `MachineNumber` | `1` | Field 1 of every request: the number set in the machine |
| `ExchangeDirectory` | `/exchange` | The folder of the telegram files |
| `MachineFileName`, `HostFileName` | `m1_to_s1.dat`, `s1_to_m1.dat` | The two telegram files |
| `PollInterval` | `00:00:00.250` | How often it looks for telegrams of the machine |
| `ReplyTimeout` | `00:00:05` | How long it waits for a reply |
| `HeartbeatInterval` | `00:00:10` | How often it asks `SYSTTIME` and publishes its heartbeat |
| `MissedRepliesUntilDisconnected` | `3` | Unanswered requests until `CommunicationFault` |
| `StateHold` | `00:00:01` | How long a running or stopped state waits for its program notification; `0` for none |
| `MachineTimeZone` | empty | The time zone of the machine's timestamps |
| `MqttDestination__ConnectionString` | `mqtt://localhost:1883` | The broker; `User` and `Password` beside it if needed |

`/healthcheck` fails while the adapter is not connected to the broker. A machine that is off is not a fault of
the adapter; `Connection/State` says that on the broker.

## Status

The topics are those of the binding of machines (data model 0.17.1). The adapter is a new service. The issue that proposes it is the
place to agree on it ([Contributing](../../CONTRIBUTING.md#how-to-contribute)).
