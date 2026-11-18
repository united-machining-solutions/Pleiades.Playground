# REST contracts (OpenAPI)

Each API serves its own description; that document is the contract.

The Timeseries and Events APIs answer on the computer of the stack only. A client on another computer reads them
through the gateway, `http://<host>:5590/timeseries` and `http://<host>:5590/events` as base addresses, with the
paths of the documents below them. The gateway passes only the reading operations, the statistics of the Timeseries
API (`POST /statistics/baseUnitValues/topics/{topic}`) included; the writing operations, `/openapi/v1.json`,
the Swagger UI at the root and `/mcp` are not reachable through it. The routes are the config `gateway` in
[`compose.yaml`](../../compose.yaml), see [ADR-0017](../../docs/adr/0017-a-read-only-gateway-for-outside-clients.md).

What the gateway passes has a document of its own: each of the two APIs also serves `/openapi/read.json`, the
operations that require its read permission and nothing else, and a Swagger UI for it at `/docs/`. The gateway
passes both, so a client on another computer sees the interface it can use, and "Try it out" goes through the
gateway, whose address and prefix the document names as its server:

| At the gateway | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://<host>:5590/timeseries/openapi/read.json` | `http://<host>:5590/timeseries/docs/` |
| Events API | `http://<host>:5590/events/openapi/read.json` | `http://<host>:5590/events/docs/` |

CI checks the routes against these documents on the running stack
([`check-gateway.mjs`](../../.github/scripts/check-gateway.mjs)): every operation of `read.json` passes the gateway,
every other operation of `v1.json` ends there.

| Service | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://localhost:5500/openapi/v1.json` | `http://localhost:5500/` |
| Events API | `http://localhost:5510/openapi/v1.json` | `http://localhost:5510/` |
| Sites API | `http://localhost:5540/openapi/v1.json` | `http://localhost:5540/` |
| Ultimaker API (optional) | `http://localhost:5530/openapi/v1.json` | No Swagger UI; see [service guide](../../source/Pleiades.Playground.Ultimaker.Api/README.md) |
| Juice bar API (optional) | `http://localhost:5550/openapi/v1.json` | No Swagger UI; see the [service guide](../../source/Pleiades.Playground.JuiceBar.Api/README.md) |

The Events API keeps the CloudEvents of the machines as they came, each with the machine id of its topic
(`mId`), and puts its views together when they are read:

- `/machineEvents`: the events themselves, filtered by machine, group (`JobMonitoring`, `WorkMasterMonitoring`,
  `Notification`), type, correlation id, job order and time; `POST /machineEvents` and `POST /machineEvents/bulk`
  take them (an event that is there already, by `source` and `id`, is answered with 409).
  `/machineEvents/gaps` names the counts of `sequence` that never arrived, per machine and group.
- `/alerts/active`, `/alerts/pairs` (each `AlertRaised` with its `AlertCleared`, by the `Id` of the alert) and
  `/alerts/statistics` (by severity after NAMUR NE 107).
- `/jobOrders`: the last state of each job order with its last result; `/jobOrders/{mId}/{jobOrderId}` adds its
  history and its program executions (a job order id may contain `/`).
- `/programExecutions`: `ProgramExecutionStarted` paired with its `ProgramExecutionEnded` or
  `ProgramExecutionAborted`, with the sums of the end.

Values and sums keep the units in which the machine delivered them, energy in watt hours for example.

Snapshots of the documents will be committed here once the first release is tagged, so that a change to an API
shows up as a diff in review.

```bash
curl -s http://localhost:5500/openapi/v1.json -o timeseries.openapi.json
curl -s http://localhost:5510/openapi/v1.json -o events.openapi.json
curl -s http://localhost:5540/openapi/v1.json -o sites.openapi.json
```
