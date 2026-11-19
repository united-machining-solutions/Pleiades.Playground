# SimpleCAM adapter 9042

Reads the state of the SimpleCAM machine 9042 from the SSE stream of the SimpleCAM backend and publishes it to
the MQTT broker as the [MQTT binding](../../contracts/mqtt/README.md) of the data model 0.17.1 says, so that the
stack stores it and every tool, card and agent can read it.

```text
SimpleCAM backend ──SSE──▶ this adapter ──MQTT──▶ broker ──▶ timeseries-persistence
  /stream/machine-9042/state                      machines/united-grinding_simplecam_9042/...
```

The stream is taken as the backend sends it. The adapter maps it and adds nothing to it but what the binding asks
for.

## What it publishes

The machine id is `<manufacturer>_<model>_<serial number>`: `united-grinding_simplecam_9042`. Below
`machines/united-grinding_simplecam_9042/umati/` every message is retained, with QoS 1 and the content type
`application/json`, in the envelope `{"timestamp": ..., "value": ...}`.

| Topic | From | What |
|---|---|---|
| `Manifest` | the adapter | The manifest: model 0.17.1, the profile `Core`, every element of it |
| `Connection/State` | the adapter | The state of the adapter: `Initializing`, `Running`, `CommunicationFault`, `Shutdown` |
| `Connection/Heartbeat` | the adapter | A count that grows every ten seconds |
| `Identification/Manufacturer`, `SerialNumber`, `ProductInstanceUri`, `ManufacturerUri`, `Model` | settings, then the stream | The settings give all five at the start; where the stream says one, its value stands. It says neither the model nor the URI of the manufacturer. |
| `State/Status` | the stream | `MachineryItemState` and `MachineryOperationMode`, goes out when it changes |
| `Notification/ActiveAlerts` | the stream | The list of alerts |
| `WorkMasterMonitoring/ActiveWorkMaster` | `activity.jobName` of the stream | The job, the model's name for what the machine works on; `null` when none runs |
| `../oem/Activity/Context` | `activity.context` | What the machine does now, for example `printing` |
| `../oem/Activity/Progress` | `activity.progressPercent` | How far the job is, as a fraction of 1 with the unit `one` (6 % is `0.06`) |
| `Identification/ProductCode`, `YearOfConstruction`, `State/FeedOverride`, `OperationCounters/PowerOnDuration` | – | The machine has none: `"available": false` in the manifest, `null` on the topic |

The stream says the job beside `State.Status`, as `activity`. The data model has no element for how far a job is
or for a layer; its `ProgramExecution` and `JobOrders` count whole runs and parts. So the progress and the context
are signals of the manufacturer: they lie below `oem/` (the prefix `x-united-grinding-com` stands only in the
manifest, with their type, unit and a description), and a consumer that knows only the model ignores them. The
stack stores them; the machine page of the example app shows the work master but not these two. The backend sends
no layer.

The backend's own `Connection.State` and `Connection.Heartbeat` are not forwarded: `Connection/State` and
`Connection/Heartbeat` tell whether this adapter lives. The adapter says `Running` while the stream answers with
`Connected`, and `CommunicationFault` while it does not. The last will of the connection says
`CommunicationFault`, retained.

The manifest is made at the start from what the adapter delivers, so it comes before the first value even when no
backend runs. An element the stream has not sent yet has no value yet; it is not "not available". The elements the
machine lacks for good are the four in the last row of the table.

After every connect to the broker the adapter sends the manifest and every value known again, and then the
state; only the first connect says `Initializing`. While the backend has neither answered nor failed, there is no
state beyond `Initializing`. A message of the stream that says only `Connected` also ends a `CommunicationFault`.
At a clean stop `Shutdown` is the last message.

A value that has no time of its own (the identification) carries the time the adapter first read it, and keeps it
while the value stays the same. The job, the context and the progress carry the time they were read: the time of
`State.Status` is that of its last change and says nothing about the progress made since. The manifest says which
is which, as `timestampSource`.

### Events

A change of `Notification.ActiveAlerts` is an event on `machines/united-grinding_simplecam_9042/events/notifications`:
`Notification.AlertRaised` for an entry that is new, `Notification.AlertChanged` for one whose fields changed,
`Notification.AlertCleared` for one that is gone. The first list raises every entry in it. Each is a CloudEvent
1.0 with QoS 1, not retained, the content type `application/cloudevents+json; charset=utf-8`, the entry as `data`
and `sequence` as the binding asks: the start of the adapter, a dot and a count of twelve digits from 1 without a
gap. The list goes out before the events that change it. While the broker is away the events wait in an outbox of
10 000 and go out after the next connect sequence.

An entry is told from the others by its `Id`; one without an `Id` is not reported. The other fields are
the ones the data model names: `ErrorCode`, `Message`, `Severity`, `SeverityValue`, `Time` and `SourceName`. They
go out as the backend says them, with two exceptions that keep a page of the stack alive: `Severity` is one of the
four categories of NAMUR NE 107 (`Failure`, `CheckFunction`, `OffSpec`, `MaintenanceRequired`), as no consumer
knows another one, and a field the backend has named `Text`, `Source` or `Timestamp` goes out as `Message`,
`SourceName` or `Time`. A backend that says a fault in its own words (`Error`, `Fault`, `Alarm`, `Critical`) says
`Failure`; every other word, `Warning` among them, and a missing one say `MaintenanceRequired`. The list and the
events agree. **The SimpleCAM backend sends an empty list at present**, so the adapter has
published no event yet: its tests and a run against a stream that raises and clears alerts show the events, a
machine does not.

## Settings

| Variable | Default | What |
|---|---|---|
| `SIMPLECAM_SSE_URL` | `http://host.docker.internal:5450/stream/machine-9042/state` in the stack | The SSE stream of the backend |
| `SIMPLECAM_MANUFACTURER` | `United Grinding` | The name of the manufacturer, until the stream says it |
| `SIMPLECAM_MANUFACTURER_URI` | `https://www.united-grinding.com` | The manufacturer in the machine id: its domain without `www.` and its top-level domain |
| `SIMPLECAM_MODEL` | `simplecam` | The model in the machine id |
| `SIMPLECAM_SERIAL_NUMBER` | `9042` | The serial number in the machine id |
| `SIMPLECAM_PRODUCT_INSTANCE_URI` | `<manufacturer URI>/<model>/<serial number>` | The `ProductInstanceUri` and the `source` of the events, until the stream says it |
| `MQTT_BROKER_URL` | `mqtt://broker:1883` | The broker |
| `MQTT_CLIENT_ID` | `simplecam-adapter-9042` | The client id at the broker |
| `HEALTH_PORT` | `3042` (`8080` in the image) | The port of `/health` |

`/health` answers `200` while the adapter is connected to the broker, and `503` while it is not. It does not
depend on the backend: without a backend the adapter says `CommunicationFault` and tries again every five
seconds. A stream that is silent for 35 seconds counts as lost.

## Run

The adapter is an optional service of the stack, in the Compose profile `simplecam`: it needs a SimpleCAM backend,
and without one it is a machine that stays in `CommunicationFault`. Start it with the profile:

```bash
docker compose --profile simplecam up -d --build
```

Or name the profile once in the private `.env`, next to `SIMPLECAM_SSE_URL`, and start as usual:

```dotenv
COMPOSE_PROFILES=simplecam
SIMPLECAM_SSE_URL=http://host.docker.internal:5450/stream/machine-9042/state
```

A backend on the same computer is reached as `host.docker.internal`; for one on another computer, the URL names
its address. That backend has to listen on its network address and not only on `localhost`, and the firewall of
its computer has to let the port in. Keep that address in the `.env` and out of a commit.

The adapter is not part of the Margo app: the app holds only services without a profile.

Alone, with Node.js 26 and `pnpm install` done:

```bash
pnpm --filter @pleiades/simplecam-adapter-9042 dev
```

`pnpm typecheck` checks the types and `pnpm test` runs the tests of the binding. The adapter is not compiled:
Node.js runs its TypeScript as it is.

## Check

```bash
docker compose logs simplecam-adapter-9042
docker compose exec broker mosquitto_sub -t 'machines/united-grinding_simplecam_9042/#' -v -W 5
```
