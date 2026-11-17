# Pleiades.Playground.Cutting.Adapter

Reads one cutting machine over its telegram files, as its host, and publishes what the machine says to the MQTT
broker, in the names of the data model. From there the stack stores it. The example app, the chat and every tool
then show the machine like any other.

Source of the values: the machine itself, through its telegram files (§2.2 of the interface specification of the
machine, which is not part of this repository). In this repository that is the
[cutting simulator](../Pleiades.Playground.Cutting.Simulator/README.md). Against a real machine, the values belong
to the operator of that machine, and the interface may first have to be enabled on it (§1.3).

## Run it

With the simulators, one adapter per machine:

```sh
docker compose --profile cutting up -d --build --wait
```

| Adapter | Machine | Serial number on the broker |
|---|---|---|
| `cutting-adapter-laser-2d` | `cutting-laser-2d` | `L-01` |
| `cutting-adapter-tube` | `cutting-tube` | `T-01` |
| `cutting-adapter-punch` | `cutting-punch` | `PU-01` |

Each adapter mounts the volume of its machine at `/exchange`. Without Docker, from this folder, next to a running
simulator: `dotnet run --launch-profile Tube` (or `Laser2D`, `Punch`).

## What it publishes

Only what the data model names; the paths and values are those of the
[MQTT binding](../../contracts/mqtt/README.md) and of the simulator of the demo. Below
`machines/{SerialNumber}/`:

| Topic | Value | From the protocol |
|---|---|---|
| `umati/Connection/State` | `Connected`, `Disconnected` | Reply to `SRC9CONN`; `$$src9_server_disconnect$$`, or no reply three times |
| `umati/Connection/Heartbeat` | counts up, unit `one` | Every 10 s a reply to `SYSTTIME`. The protocol has no heartbeat of its own |
| `umati/State/MachineryItemState` | `Executing` | `MaschineLaeuft` |
| | `NotExecuting` | `MaschineSteht`, reason 2 |
| | `OutOfService` | `MaschineSteht`, reason 1 (fault) |
| | `NotAvailable` | `$$src9_server_disconnect$$`: the machine switches off |
| `umati/State/MachineryOperationMode` | `None` | The protocol knows no operation mode; the data model asks for `None` then |
| `umati/State/FeedOverride` | percent ÷ 100, unit `one` | `Feedrate`; `MACHINFO` after connecting makes the machine send it (§6.4) |
| `umati/Channel/1/ChannelState` | `Active` | `StartNCP`; `MaschineLaeuft` after a halt |
| | `Interrupted` | `MaschineSteht`, reason 1 or 2, while a program runs: a halt |
| | `Reset` | `EndeNCP`, `ResetNCP` |
| `umati/Production/ActiveProgram` | the NC program, empty when none runs | `StartNCP` field 2; `EndeNCP`, `ResetNCP` |
| `events/notifications` | `Raised`, level `Error` | `AktuelleAlarme`: the alarm number is the notification id |
| | `Reset`, same correlation id | `MaschineLaeuft`, or `MaschineSteht` reason 2 |

**Halt or end?** The machine sends `MaschineSteht` whenever a program ends, is aborted or halts, and
`MaschineLaeuft` whenever one starts or goes on (§5.8, §5.9), often just before `EndeNCP` or `StartNCP`. So
the adapter holds both back for `Config__StateHold`. When a program notification comes in that time, the
state of the machine is published, but the channel shows no halt. Otherwise, the program halted. The values
keep the time the machine gave them; only their publication waits. A stop reason other than 1 or 2 is ignored,
and a start without an end, an end without a start and a re-entry (`StartNCP` field 8 = 1) go to the log: the
data model has no place for them.

A value is published when it changes; the app reads the last one, however old. The heartbeat says that it is
still true.

**Time.** The timestamps of the protocol have no time zone (§4). The adapter reads them in
`Config__MachineTimeZone` (an IANA id such as `Europe/Berlin`; empty: its own zone) and publishes UTC. A timestamp
in the future, or one it cannot read, becomes the time of receipt. The protocol counts whole seconds. When two
values of one topic share a second, the later one is moved one millisecond on, so that it stays the later one.

**Not published.** The production plan, orders, runtimes, tube allocations, pallets and stacks have no
element in the data model that the binding publishes. Lists such as `Production.JobOrders` are not published
(see "Deviations" in the binding).

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
| `SerialNumber` | – | The machine id in every topic |
| `MachineNumber` | `1` | Field 1 of every request: the number set in the machine |
| `ExchangeDirectory` | `/exchange` | The folder of the telegram files |
| `MachineFileName`, `HostFileName` | `m1_to_s1.dat`, `s1_to_m1.dat` | The two telegram files |
| `PollInterval` | `00:00:00.250` | How often it looks for telegrams of the machine |
| `ReplyTimeout` | `00:00:05` | How long it waits for a reply |
| `HeartbeatInterval` | `00:00:10` | How often it asks `SYSTTIME` |
| `MissedRepliesUntilDisconnected` | `3` | Unanswered requests until `Disconnected` |
| `StateHold` | `00:00:01` | How long a running or stopped state waits for its program notification; `0` for none |
| `MachineTimeZone` | empty | The time zone of the machine's timestamps |
| `MqttDestination__ConnectionString` | `mqtt://localhost:1883` | The broker; `User` and `Password` beside it if needed |

`/healthcheck` fails while the adapter is not connected to the broker. A machine that is off is not a fault of
the adapter; `Connection/State` says that on the broker.

## Status

The topics are those the binding already has. The adapter is a new service. The issue that proposes it is the
place to agree on it ([Contributing](../../CONTRIBUTING.md#how-to-contribute)).
