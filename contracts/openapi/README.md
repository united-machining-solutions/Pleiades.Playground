# REST contracts (OpenAPI)

Each API serves its own description; that document is the contract.

| Service | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://localhost:5500/openapi/v1.json` | `http://localhost:5500/` |
| Events API | `http://localhost:5510/openapi/v1.json` | `http://localhost:5510/` |
| Sites API | `http://localhost:5540/openapi/v1.json` | `http://localhost:5540/` |
| Ultimaker API (optional) | `http://localhost:5530/openapi/v1.json` | No Swagger UI; see [service guide](../../source/Pleiades.Playground.Ultimaker.Api/README.md) |
| Juice bar API (optional) | `http://localhost:5550/openapi/v1.json` | No Swagger UI; see the [service guide](../../source/Pleiades.Playground.JuiceBar.Api/README.md) |
| OPC UA adapter, management API (proof of concept) | `http://localhost:5560/openapi/v1.json` | No Swagger UI; see [Management API](../../source/Pleiades.Playground.OpcUa.Adapter/README.md#management-api) |

The Events API keeps the CloudEvents of the machines as they came, each with the machine id of its topic
(`mId`), and puts its views together when they are read:

- `/machineEvents`: the events themselves, filtered by machine, group (`JobMonitoring`, `WorkMasterMonitoring`,
  `Notification`), type, correlation id, job order and time; `POST /machineEvents` and `POST /machineEvents/bulk`
  take them (an event that is there already, by `source` and `id`, is answered with 409).
  `/machineEvents/gaps` names the counts of `sequence` that never arrived, per machine and group.
- `/alerts/active`, `/alerts/pairs` (each `AlertRaised` with its `AlertCleared`, by the `Id` of the alert) and
  `/alerts/statistics` (by severity after NAMUR NE 107).
- `/jobOrders`: the last state of each job order with its last result, one per machine and job order id, filtered
  by machine, job order id (`jobOrderId`, on every machine that has it), order number of the ERP (`orderNumber`,
  one of `OrderNumbers`), state and last change; `/jobOrders/{mId}/{jobOrderId}` adds its history and its
  program executions (a job order id may contain `/`).
- `/jobs/{jobOrderId}`: one job across the machines it passes. A job carries the same `JobOrderID` on every
  machine, the id of the MES; each machine with a job order of that id is a step, with its state, start, end,
  duration, quantities and the sums of its program executions, sorted by start, then planned start, then first
  seen. `waitingSecondsBefore` is the time from the end of the step before to its start (negative when the two
  overlap, null when a time is not known), and `position` says where the job stands: `Running` or `Interrupted`
  on a machine, `Waiting` before its first start, `Between` two steps, `Ended` or `Aborted`. An id that stood on
  a machine before, as a simulator counts its ids anew after a restart, counts there only from its last
  `JobOrderAdded` (or the first event after a `JobOrderRemoved`) on, and its program executions only from the
  start of that step on.
- `/programExecutions`: `ProgramExecutionStarted` paired with its `ProgramExecutionEnded` or
  `ProgramExecutionAborted`, with the sums of the end.

Values and sums keep the units in which the machine delivered them, energy in watt hours for example.

The Sites API keeps the sites with their halls (`/sites`) and which machine stands on which site and in which
hall (`/placements`). A placement in a hall may have a position, `/placements/{machineId}/position`: where in
the hall the machine stands on a plan seen from above, the middle of the machine, `x` to the right and `y` down
from the upper left corner of the plan. As everything about a place, it is in an SI unit, metre. A hall has no
size of its own. See the [service guide](../../source/Pleiades.Playground.Sites.Api/README.md).

The management API of the OPC UA adapter adds, lists and removes the machines that speak OPC UA:
`/endpoints` and `/endpoints/machines` ask a server, `/users` keeps the user of a server that wants one,
`/machines` and `/machines/{serialNumber}` register, show and remove a machine, `/drafts/{draftId}/commit` adds
what a proposal of the chat holds. It has no sign-in and answers on this computer only (`OPCUA_ADAPTER_BIND`).
Removing a machine takes its retained messages back from the broker; it deletes nothing that is stored. While the
broker cannot be reached, the removal answers `503` and the machine stays added.

Snapshots of the documents will be committed here once the first release is tagged, so that a change to an API
shows up as a diff in review.

```bash
curl -s http://localhost:5500/openapi/v1.json -o timeseries.openapi.json
curl -s http://localhost:5510/openapi/v1.json -o events.openapi.json
curl -s http://localhost:5540/openapi/v1.json -o sites.openapi.json
```
