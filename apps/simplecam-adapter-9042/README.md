# SimpleCAM Adapter 9042

**AG2 v0.17.1 Adapter** — Consumes Server-Sent Events (SSE) from SimpleCAM backend, publishes machine state to Pleiades MQTT broker in CloudEvents format.

## Data Flow

```
SimpleCAM Backend (C++)
  ↓ SSE /stream/machine-9042/state
Adapter (TypeScript)
  ↓ Parse JSON events
  ↓ Map to AG2 v0.17.1 paths
  ↓ Publish to MQTT
Pleiades Broker (MQTT)
  ├─ machines/united-grinding_simplecam_9042/umati/* (state values, retained)
  └─ machines/united-grinding_simplecam_9042/events/* (CloudEvents, transient)
```

## MQTT Topics

### State Values (Retained)

Retained messages on `machines/united-grinding_simplecam_9042/umati/{path}`:

```json
{
  "value": <any>,
  "timestamp": "2026-11-18T10:30:00.000Z"
}
```

**Paths from AG2 v0.17.1:**
- `Identification/*` — manufacturer, model, serialNumber
- `Connection/State` — Connected | Disconnected
- `Connection/Heartbeat` — UNIX timestamp (every 10 seconds)
- `State/Status` — Idle | Executing | Error
- `Notification/ActiveAlerts` — array of alert objects

### Events (CloudEvents, Not Retained)

Transient CloudEvents on `machines/united-grinding_simplecam_9042/events/{type}`:

```json
{
  "specversion": "1.0",
  "type": "com.pleiades.simplecam.{type}",
  "source": "machines/united-grinding_simplecam_9042",
  "subject": "{path}",
  "id": "uuid",
  "time": "2026-11-18T10:30:00.000Z",
  "datacontenttype": "application/json",
  "data": {
    "path": "{path}",
    "value": <any>,
    "timestamp": "2026-11-18T10:30:00.000Z"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMPLECAM_SSE_URL` | `http://localhost:5450/stream/machine-9042/state` | SimpleCAM SSE endpoint |
| `MQTT_BROKER_URL` | `mqtt://broker:1883` | MQTT broker connection URL |
| `MQTT_CLIENT_ID` | `simplecam-adapter-9042` | MQTT client identifier |
| `HEALTH_PORT` | `3042` | Health check endpoint port |

## Running Locally

### Prerequisites
- Node.js 22+
- SimpleCAM backend running on `localhost:5450` (or set `SIMPLECAM_SSE_URL`)
- MQTT broker running on `localhost:1883` (or set `MQTT_BROKER_URL`)

### Development

```bash
pnpm install
pnpm dev
```

Health check:
```bash
curl http://localhost:3042/health
```

### Type Check & Build

```bash
pnpm typecheck
pnpm build
```

## Docker

Build and run:
```bash
docker build -t simplecam-adapter-9042 .
docker run -e SIMPLECAM_SSE_URL=http://host.docker.internal:5450/stream/machine-9042/state \
           -e MQTT_BROKER_URL=mqtt://broker:1883 \
           -p 3042:3042 \
           simplecam-adapter-9042
```

## Docker Compose Integration

In `compose.yaml`:

```yaml
simplecam-adapter-9042:
  build:
    context: .
    dockerfile: apps/simplecam-adapter-9042/Dockerfile
  environment:
    SIMPLECAM_SSE_URL: http://host.docker.internal:5450/stream/machine-9042/state
    MQTT_BROKER_URL: mqtt://broker:1883
    MQTT_CLIENT_ID: simplecam-adapter-9042
    HEALTH_PORT: "3042"
  ports:
    - "3042:3042"
  depends_on:
    - broker
    - timeseries-persistence
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3042/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 5s
```

## Verification

### 1. Check adapter health
```bash
curl http://localhost:3042/health
```

Expected: `HTTP 200 OK`

### 2. Subscribe to state topic

```bash
docker exec -it broker mosquitto_sub -h localhost -t 'machines/united-grinding_simplecam_9042/umati/+' -v
```

Expected output when SimpleCAM sends state:
```
machines/united-grinding_simplecam_9042/umati/Identification/Manufacturer {"value":"united-grinding","timestamp":"..."}
machines/united-grinding_simplecam_9042/umati/Connection/Heartbeat {"value":1700300400,"timestamp":"..."}
machines/united-grinding_simplecam_9042/umati/State/Status {"value":"Idle","timestamp":"..."}
```

### 3. Subscribe to events topic

```bash
docker exec -it broker mosquitto_sub -h localhost -t 'machines/united-grinding_simplecam_9042/events/+' -v
```

Expected: CloudEvents for state changes

## AG2 v0.17.1 Changes from v0.13.1

- **Machine ID format**: `united-grinding_simplecam_9042` (from `9042`)
- **Topic hierarchy**: `machines/{id}/umati` for state, `machines/{id}/events` for CloudEvents
- **CloudEvents**: New CloudEvents 1.0 envelope for all event topics
- **Identification**: Now includes `manufacturer`, `model`, `serialNumber` (separately)
- **Heartbeat**: Every 10 seconds as UNIX timestamp (not counter)

## Architecture Notes

- **Automatic reconnection**: Connects every 5 seconds if SSE stream is lost
- **Retained messages**: State values stay on broker until replaced
- **Non-retained events**: CloudEvents expire after disconnect
- **Health endpoint**: Returns 503 Service Unavailable if MQTT not connected
- **Signal handling**: Uses dumb-init in Docker for graceful shutdown

## Troubleshooting

### No data appearing on MQTT topics

1. Check adapter is running: `curl http://localhost:3042/health`
2. Check SimpleCAM SSE endpoint: `curl http://localhost:5450/stream/machine-9042/state`
3. Check adapter logs for JSON parse errors
4. Verify MQTT broker is accessible from adapter container

### SSE connection lost

Adapter logs: `[SSE] Stream error: ...`

Check SimpleCAM backend is running and SSE endpoint returns valid events.

### MQTT connection refused

Adapter logs: `[MQTT] Error: ...`

Check broker is running on specified URL and accepting connections.
