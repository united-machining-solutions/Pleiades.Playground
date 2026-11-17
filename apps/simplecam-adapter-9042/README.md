# SimpleCAM Adapter 9042

AG2 machine state adapter for SimpleCAM machine 9042. Consumes Server-Sent Events (SSE) from the C++ backend (port 5450) and publishes AG2 Core data model values to the MQTT broker.

## Overview

```
SimpleCAM Backend (C++)
SSE: /stream/machine-9042/state
         ↓
SimpleCAM Adapter 9042 (TypeScript/Node.js)
         ↓
MQTT Broker (Pleiades)
Topic: machines/9042/umati/*
```

## Data Flow

1. **Source:** SimpleCAM C++ backend at `http://localhost:5450`
   - Endpoint: `GET /stream/machine-9042/state`
   - Format: Server-Sent Events (SSE)
   - Data: AG2 Core data model v0.13.1

2. **Adapter:** This service (TypeScript)
   - Consumes SSE stream
   - Maps AG2 JSON to MQTT topics
   - Publishes to `machines/9042/umati/*`

3. **Destination:** MQTT Broker (Mosquitto)
   - Topics stored by timeseries-persistence
   - Queryable via timeseries-api (port 5500)
   - Visible in Pleiades UI

## Topics (AG2 Core Mandatory)

```
machines/9042/umati/Identification/Manufacturer
machines/9042/umati/Identification/SerialNumber
machines/9042/umati/Identification/ProductInstanceUri
machines/9042/umati/Connection/Heartbeat
machines/9042/umati/Connection/State
machines/9042/umati/State/Status
machines/9042/umati/Notification/ActiveAlerts
```

Each topic receives a JSON payload with:
```json
{
  "value": <any>,
  "timestamp": "2026-11-17T14:32:15.000Z"
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SIMPLECAM_SSE_URL` | `http://localhost:5450/stream/machine-9042/state` | SimpleCAM SSE endpoint URL |
| `MQTT_BROKER_URL` | `mqtt://broker:1883` | MQTT broker connection string |
| `MQTT_CLIENT_ID` | `simplecam-adapter-9042` | MQTT client identifier |
| `HEALTH_PORT` | `3042` | Health check endpoint port |

## Running Locally

```bash
# Install dependencies
pnpm install

# Type check
pnpm typecheck

# Run (requires SimpleCam backend on port 5450 and MQTT broker on port 1883)
pnpm dev
```

## Health Check

The adapter exposes a health endpoint on port 3042:

```bash
curl http://localhost:3042/health
```

Returns HTTP 200 if connected to MQTT broker, 503 if disconnected.

## Docker Compose

Configured in `compose.yaml`:
- Waits for MQTT broker to be healthy
- Waits for timeseries-persistence to be started
- Automatic reconnection on failure
- Health check integrated with Docker health system

## Verification

After starting the stack:

```bash
# 1. Verify adapter is healthy
docker compose ps  # simplecam-adapter-9042 should be "Up"

# 2. Check topics in Swagger UI
# Navigate to http://localhost:5500/
# Search for topics starting with "machines/9042/"

# 3. Manual MQTT subscription
docker compose exec -T broker mosquitto_sub -t 'machines/9042/umati/#'
```

## Implementation Notes

- **SSE Parsing:** Manual line-based parsing (compatible with standard SSE format)
- **Connection Resilience:** Automatic reconnection to SSE on stream loss (5s delay)
- **MQTT Publishing:** Retained topics for state recovery after disconnect
- **Timestamps:** ISO8601 format (UTC, `Z` suffix)
- **Terms of Use:** SimpleCAM is internal UnitedGrinding software; no external license restrictions

## References

- AG2 Spec: `C:\Repos\MachineTool-DataModel\spec\spec.md` (v0.13.1)
- SimpleCAM SSE API: `C:\Repos\UnitedGrinding.SimpleCamUgVcpkg\source\Backend\RestApi.yml`
- MQTT Binding: `contracts/mqtt/README.md` (this repository)
- Pleiades add-source Skill: `.claude/skills/add-source/SKILL.md`
