# SimpleCAM adapter 9042

Reads the state of the SimpleCAM machine 9042 from the SSE stream of the SimpleCAM backend and publishes it to
the MQTT broker, after the umati data model 0.17.1, so that the stack stores it and every tool, card and agent
can read it.

```text
SimpleCAM backend ──SSE──▶ this adapter ──MQTT──▶ broker ──▶ timeseries-persistence
  /stream/machine-9042/state                      machines/united-grinding_simplecam_9042/...
```

The machine id is `<manufacturer>_<model>_<serial number>`: `united-grinding_simplecam_9042`.

## Topics

| Topic | Retained | What |
|---|---|---|
| `machines/united-grinding_simplecam_9042/umati/<path>` | yes | One value of the state, as `{"value": ..., "timestamp": ...}` |
| `machines/united-grinding_simplecam_9042/umati/Connection/Heartbeat` | yes | The heartbeat, every ten seconds |
| `machines/united-grinding_simplecam_9042/events/StateChanged` | no | A CloudEvent when the status or the connection state changes |

The paths come from the stream. The values, the units and the topics are agreed in
[`contracts/mqtt`](../../contracts/mqtt/README.md).

## Settings

| Variable | Default | What |
|---|---|---|
| `SIMPLECAM_SSE_URL` | `http://host.docker.internal:5450/stream/machine-9042/state` | The SSE stream of the backend |
| `MQTT_BROKER_URL` | `mqtt://broker:1883` | The broker |
| `MQTT_CLIENT_ID` | `simplecam-adapter-9042` | The client id at the broker |
| `HEALTH_PORT` | `3042` (`8080` in the image) | The port of `/health` |

`/health` answers `200` while the adapter is connected to the broker, and `503` while it is not. It does not
depend on the backend: without a backend the adapter keeps trying to connect every five seconds.

## Run

In the stack: `docker compose up -d --build`. A backend on this computer is reached as `host.docker.internal`.

Alone, with Node.js 26 and `pnpm install` done:

```bash
pnpm --filter @pleiades/simplecam-adapter-9042 dev
```

`pnpm typecheck` checks the types. The adapter is not compiled: Node.js runs its TypeScript as it is.

## Check

```bash
docker compose logs simplecam-adapter-9042
docker compose exec broker mosquitto_sub -t 'machines/united-grinding_simplecam_9042/#' -v -C 5
```
