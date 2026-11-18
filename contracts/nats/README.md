# NATS binding (draft 0.1.0)

How the data of the stack appears on a NATS server: every value and every event of the
[MQTT binding](../mqtt/README.md) as a CloudEvent 1.0, one NATS message each. The service
`nats-bridge` ([source](../../source/Pleiades.Playground.Nats.Bridge/)) writes it. It reads the MQTT broker of the
stack and nothing else, and it changes no value: the units stay those of the MQTT binding.

```text
simulator/adapter ──MQTT──▶ broker ──▶ nats-bridge ──CloudEvent──▶ NATS server (JetStream)
```

The NATS server is not part of the stack. By default the bridge writes to one on the computer that runs the stack.
Why: see [ADR-0018](../../docs/adr/0018-machine-data-leaves-the-stack-as-cloudevents-over-nats.md).

## Subjects

The subject is a prefix and the levels of the MQTT topic, every `/` a `.`:

```text
{prefix}.machines.{MachineId}.umati.<path>       a value of the data model, and the manifest
{prefix}.machines.{MachineId}.oem.<path>         a signal the machine manufacturer defines
{prefix}.machines.{MachineId}.events.<group>     an event: jobs, workmasters, notifications
{prefix}.sites.{SiteId}.{Source}.<path>          a value about a place
```

- `{prefix}` is `local.pleiades` by default (`NATS_SUBJECT_PREFIX`). It is one or more tokens. A server whose
  JetStream stream takes `local.>` keeps the messages without any setup.
- The levels are the ones of the MQTT topic, unchanged. The MQTT binding keeps `.`, `*`, `>` and white space out of
  a machine id. A topic with such a level anyway, or with an empty one, is not sent on.
- A topic outside the MQTT binding is not sent on.

```text
local.pleiades.machines.alcyone-machines_AX-400_P-04.umati.Manifest
local.pleiades.machines.alcyone-machines_AX-400_P-04.umati.State.Status
local.pleiades.machines.alcyone-machines_AX-400_P-04.umati.Consumption.Electricity.Main.AcActivePowerTotal
local.pleiades.machines.alcyone-machines_AX-400_P-04.oem.Spindle.1.BearingTemperature
local.pleiades.machines.alcyone-machines_AX-400_P-04.events.jobs
local.pleiades.sites.demo.weather.AirTemperature
```

| Subscription | What it gives |
|---|---|
| `local.pleiades.>` | everything |
| `local.pleiades.machines.*.events.*` | every event of every machine |
| `local.pleiades.machines.*.events.notifications` | every alert |
| `local.pleiades.machines.*.umati.State.Status` | the state of every machine |
| `local.pleiades.machines.alcyone-machines_AX-400_P-04.>` | everything of P-04 |
| `local.pleiades.machines.*.*.Spindle.*.BearingTemperature` | the bearing temperature of every spindle, whatever the namespace |
| `local.pleiades.sites.>` | every value about a place |

## Message

Every message is a CloudEvent 1.0 in the JSON format, structured mode, UTF-8. It has two headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/cloudevents+json; charset=utf-8` |
| `Nats-Msg-Id` | JetStream only. For a value the `id` of the CloudEvent. For an event, whose `id` is unique only together with its `source`, 32 hex digits: the first 128 bits of SHA-256 over `source`, a line feed and `id`. JetStream drops a message with a message id it has seen in its duplicate window. |

There are four kinds. Tell them apart by `type`:

| `type` | From the MQTT topic | `data` |
|---|---|---|
| the path of the event, for example `JobMonitoring.JobOrderStarted` | `machines/{MachineId}/events/<group>` | the event of the machine, unchanged (see [Events](#an-event-of-a-machine)) |
| `pleiades.playground.machine.value.v1` | `machines/{MachineId}/umati/<path>`, `machines/{MachineId}/oem/<path>` | the value envelope of the MQTT binding |
| `pleiades.playground.machine.manifest.v1` | `machines/{MachineId}/umati/Manifest` | the manifest |
| `pleiades.playground.site.value.v1` | `sites/{SiteId}/{Source}/<path>` | the value envelope of a place |

### A value of a machine

The bridge wraps the value envelope of the MQTT binding, as it came, as `data` of a CloudEvent of its own:

```json
{
  "specversion": "1.0",
  "id": "b51dafccb06895991935879a40b768f9",
  "source": "/machines/alcyone-machines_AX-400_P-04",
  "type": "pleiades.playground.machine.value.v1",
  "subject": "umati/Consumption/Electricity/Main/AcActivePowerTotal",
  "time": "2026-11-18T09:52:06.100Z",
  "datacontenttype": "application/json",
  "machineid": "alcyone-machines_AX-400_P-04",
  "mqtttopic": "machines/alcyone-machines_AX-400_P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal",
  "mqttretained": false,
  "data": { "timestamp": "2026-11-18T09:52:06.100Z", "value": 2439.4, "unit": "watt" }
}
```

A snapshot or a list keeps its object or array in `data.value`:

```json
{
  "specversion": "1.0",
  "id": "7c0e3d2f9a514b6e8d4f2a1c3b5e7d90",
  "source": "/machines/alcyone-machines_AX-400_P-04",
  "type": "pleiades.playground.machine.value.v1",
  "subject": "umati/State/Status",
  "time": "2026-11-17T09:15:02.123Z",
  "datacontenttype": "application/json",
  "machineid": "alcyone-machines_AX-400_P-04",
  "mqtttopic": "machines/alcyone-machines_AX-400_P-04/umati/State/Status",
  "mqttretained": true,
  "data": { "timestamp": "2026-11-17T09:15:02.123Z",
            "value": { "MachineryItemState": "Executing", "MachineryOperationMode": "Processing" } }
}
```

| Attribute | Content |
|---|---|
| `specversion` | `1.0` |
| `id` | 32 hex digits: the first 128 bits of SHA-256 over the MQTT topic, a line feed and the payload. The same message has the same id, also when the broker hands a retained value over again. A new value has a new `timestamp` and so a new id. |
| `source` | `/machines/{MachineId}` |
| `type` | `pleiades.playground.machine.value.v1`, or `pleiades.playground.machine.manifest.v1` for the manifest |
| `subject` | the path below the machine, with its namespace: `umati/State/Status`, `oem/Spindle/1/BearingTemperature`, `umati/Manifest` |
| `time` | the `timestamp` of the envelope, the source time, in UTC: with milliseconds, or with seven digits where the timestamp is finer. The manifest has none: there it is the time the bridge read it. |
| `datacontenttype` | `application/json` |
| `machineid` | extension: the machine id, as in the subject |
| `mqtttopic` | extension: the MQTT topic the value came on |
| `mqttretained` | extension: `true` when the broker handed it over as a retained value, at the (re)connect of the bridge, and so not as it came up |
| `data` | the value envelope of the MQTT binding, unchanged: `timestamp`, `value`, `unit` where the value has one, `correlationId` where the model allows it |

### A value of a place

The same as a value of a machine, with the place instead of the machine:

```json
{
  "specversion": "1.0",
  "id": "3e9a51f0c2d84b7a96e1d0f5a8c2b347",
  "source": "/sites/demo/weather",
  "type": "pleiades.playground.site.value.v1",
  "subject": "AirTemperature",
  "time": "2026-11-16T09:10:00.000Z",
  "datacontenttype": "application/json",
  "siteid": "demo",
  "mqtttopic": "sites/demo/weather/AirTemperature",
  "mqttretained": false,
  "data": { "timestamp": "2026-11-16T09:10:00Z", "value": 10.7, "unit": "degreeCelsius" }
}
```

`source` is `/sites/{SiteId}/{Source}`, `subject` the path below the source. The extension `siteid` takes the place
of `machineid`.

### An event of a machine

An event is a CloudEvent on the broker already, as the data model asks for it. The bridge sends it on byte for byte,
neither wrapped nor changed. The CloudEvent is the one the [MQTT binding](../mqtt/README.md#events) describes:

```json
{ "specversion": "1.0", "id": "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60", "source": "https://www.alcyone-machines.example/AX-400/P-04",
  "type": "WorkMasterMonitoring.ProgramExecutionEnded", "time": "2026-11-17T09:21:40.000Z",
  "sequence": "20261117T065812Z.000000001842", "correlationid": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001",
  "dataschema": "urn:umati2:datamodel:0.17.1:event.schema.json",
  "data": { "ExecutionId": "3f6c2a9e-1b7d-4c55-9e0a-7d2b8c41f001", "JobOrderID": "4711/01", "ActiveWorkMaster": "WM-SHAFT-4711",
            "State": "Ended", "StartTime": "2026-11-17T08:31:00.000Z",
            "Duration": 3040.0, "PartsProduced": 1, "EnergyElectricity": 1850.5 } }
```

on `local.pleiades.machines.alcyone-machines_AX-400_P-04.events.workmasters`.

- `source` is the `ProductInstanceUri` of the machine, not `/machines/{MachineId}`. The machine id is in the
  subject.
- `type` is the path of the event in the model, `sequence` counts the events of a machine per group without a
  gap. A consumer finds a gap and a duplicate as the MQTT binding says.
- `Nats-Msg-Id` is made of `source` and `id` (see [Message](#message)), so two machines whose events share an `id`
  do not swallow each other in the duplicate window.
- A message on `events/` without the content type `application/cloudevents+json`, or without `specversion` `1.0`,
  `id`, `source` and `type`, is not sent on.

## Delivery

| Rule | What |
|---|---|
| At least once | The bridge reads with QoS 1 in a persistent session and acknowledges a message to the MQTT broker only when its handling ends: after the acknowledgement of the stream (JetStream), or after it was dropped (below). A message can come twice. Find a duplicate by `source` and `id`. JetStream drops one within its duplicate window by `Nats-Msg-Id`. |
| Order | The bridge sends the messages one by one, in the order the broker hands them over. MQTT keeps the order within one topic, so the order within one subject is kept too. Between two subjects only `time` orders. |
| Retained values | At every (re)connect the MQTT broker hands over the last value of every topic. They go on with `mqttretained: true` and the `id` they had before. `NATS_FORWARD_RETAINED=false` leaves them out. A cleared retained value (an empty payload) is not sent on. |
| NATS away | While the connection to NATS is down the bridge waits: the message stays unacknowledged, and what follows stays at the MQTT broker, in the session of the bridge. No message is dropped by the bridge then. The broker keeps a bounded queue per session (Mosquitto: 1000 messages by default) and drops beyond it, so a long outage loses values at the broker, and for events the gap shows in `sequence`. The bridge has no outbox of its own. |
| Refused | A publish that fails while the connection stands (no stream takes the subject, no permission) is tried again, five times by default, each wait twice the one before (1 s, 2 s, 4 s, 8 s, at most a minute). Then the message is logged and dropped, and the health check is unhealthy until a message goes through again. |
| Without JetStream | `NATS_JETSTREAM=false` publishes plain core NATS: no acknowledgement and no `Nats-Msg-Id`. Only who is subscribed at that moment gets the message. |

## Units

The units are those of the MQTT binding, and the bridge converts nothing ([ADR-0002](../../docs/adr/0002-si-units-joule-and-one.md)).
A machine carries the units of the data model (energy in `wattHour`), a place SI units (energy in `joule`).

## Configuration

The bridge is the Compose service `nats-bridge` with the profile `nats`:

```sh
docker compose --profile nats up -d
```

| Variable | Default | What |
|---|---|---|
| `NATS_URL` | `nats://host.docker.internal:4222` | the NATS server as the container reaches it; several separated by commas |
| `NATS_SUBJECT_PREFIX` | `local.pleiades` | the tokens every subject starts with |
| `NATS_JETSTREAM` | `true` | publish through JetStream and wait for its acknowledgement |
| `NATS_CREATE_STREAM` | `false` | create the stream `NATS_STREAM_NAME` with the subjects `<prefix>.>` before the first publish, when it is missing. A stream of that name that exists is not changed. Leave it `false` where the server has a stream for the subjects already. |
| `NATS_STREAM_NAME` | `pleiades` | the stream created with `NATS_CREATE_STREAM` |
| `NATS_STREAM_MAX_AGE` | `7.00:00:00` | how long that stream keeps a message (d.hh:mm:ss) |
| `NATS_FORWARD_RETAINED` | `true` | send on the retained values the broker hands over on every connect |
| `NATS_USER`, `NATS_PASSWORD` | – | sign-in with user and password |
| `NATS_TOKEN` | – | sign-in with a token |
| `NATS_CREDS_FILE`, `NATS_NKEY_FILE` | – | sign-in with a credentials or NKey file: a path inside the container |
| `NATS_TLS_MODE` | `Disable` | `Disable`, `Auto`, `Prefer`, `Require` or `Implicit`. An address `tls://…` needs one other than `Disable`. |
| `NATS_TLS_CERT_FILE`, `NATS_TLS_KEY_FILE`, `NATS_TLS_CA_FILE` | – | client certificate, its key and the authority to trust: paths inside the container |
| `NATS_TLS_INSECURE_SKIP_VERIFY` | `false` | accept any server certificate, for development only |

A file goes into the container with a `compose.override.yaml` of your own, for example
`volumes: ["./my-nats-certs:/certs:ro"]` and `NATS_TLS_CERT_FILE=/certs/cert.pem`. Never commit a password, a token,
a key or a certificate.

The health check `/healthcheck` of the bridge is healthy while the MQTT broker is connected and has granted
every subscription, the connection to NATS is open, and the last publish went through.

## Trying it

With the [NATS CLI](https://github.com/nats-io/natscli) on the computer of the NATS server:

```sh
nats sub 'local.pleiades.machines.*.events.>'                     # every event, as it comes
nats sub 'local.pleiades.machines.*.umati.State.Status'           # the state of every machine
nats stream view local --subject 'local.pleiades.>'               # what the stream keeps
```
