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
| `Identification/Manufacturer`, `SerialNumber`, `ProductInstanceUri` | the stream | As it says them |
| `Identification/ManufacturerUri`, `Model` | settings | They form the machine id; the stream says neither |
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

After every connect to the broker it sends the manifest and every value again, and then the state; only the
first connect says `Initializing`.

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
go out as the backend says them. **The SimpleCAM backend sends an empty list at present**, so the adapter has
published no event yet: its tests and a run against a stream that raises and clears alerts show the events, a
machine does not.

## Settings

| Variable | Default | What |
|---|---|---|
| `SIMPLECAM_SSE_URL` | `http://host.docker.internal:5450/stream/machine-9042/state` in the stack | The SSE stream of the backend |
| `SIMPLECAM_MANUFACTURER_URI` | `https://www.united-grinding.com` | The manufacturer in the machine id: its domain without `www.` and its top-level domain |
| `SIMPLECAM_MODEL` | `simplecam` | The model in the machine id |
| `SIMPLECAM_SERIAL_NUMBER` | `9042` | The serial number in the machine id |
| `MQTT_BROKER_URL` | `mqtt://broker:1883` | The broker |
| `MQTT_CLIENT_ID` | `simplecam-adapter-9042` | The client id at the broker |
| `HEALTH_PORT` | `3042` (`8080` in the image) | The port of `/health` |

`/health` answers `200` while the adapter is connected to the broker, and `503` while it is not. It does not
depend on the backend: without a backend the adapter says `CommunicationFault` and tries again every five
seconds. A stream that is silent for 35 seconds counts as lost.

## Run

In the stack: `docker compose up -d --build`. A backend on this computer is reached as `host.docker.internal`.

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
